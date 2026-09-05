import Foundation
import Capacitor
import StoreKit
import UIKit

private enum RunluSubscriptionError: LocalizedError {
    case productUnavailable
    case verificationFailed
    case unexpectedProduct
    case noForegroundScene

    var errorDescription: String? {
        switch self {
        case .productUnavailable:
            return "The Warehouse OS subscription is not available from the current App Store environment."
        case .verificationFailed:
            return "The App Store transaction could not be verified."
        case .unexpectedProduct:
            return "The App Store returned an unexpected product."
        case .noForegroundScene:
            return "A foreground window is required to manage subscriptions."
        }
    }
}

@objc(RunluSubscriptionPlugin)
public class RunluSubscriptionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RunluSubscriptionPlugin"
    public let jsName = "RunluSubscription"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProduct", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getEntitlement", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "manageSubscriptions", returnType: CAPPluginReturnPromise)
    ]

    private let productID = "ca.runlu.warehouseos.monthly"
    private var transactionListener: Task<Void, Never>?

    override public func load() {
        transactionListener = Task { [weak self] in
            for await result in Transaction.updates {
                guard !Task.isCancelled else { break }
                guard case .verified(let transaction) = result else { continue }
                guard let self, transaction.productID == self.productID else { continue }

                await transaction.finish()
                let state = await self.entitlementPayload()
                self.notifyListeners("entitlementChanged", data: state)
            }
        }
    }

    deinit {
        transactionListener?.cancel()
    }

    @objc public func getProduct(_ call: CAPPluginCall) {
        Task {
            do {
                guard let product = try await loadProduct() else {
                    call.resolve([
                        "available": false,
                        "productId": productID,
                        "canMakePayments": AppStore.canMakePayments
                    ])
                    return
                }

                var payload: [String: Any] = [
                    "available": true,
                    "productId": product.id,
                    "displayName": product.displayName,
                    "description": product.description,
                    "displayPrice": product.displayPrice,
                    "canMakePayments": AppStore.canMakePayments
                ]

                if let subscription = product.subscription {
                    payload["periodValue"] = subscription.subscriptionPeriod.value
                    payload["periodUnit"] = periodUnit(subscription.subscriptionPeriod.unit)
                    payload["introEligible"] = await subscription.isEligibleForIntroOffer

                    if let offer = subscription.introductoryOffer {
                        payload["introAvailable"] = true
                        payload["introPeriodValue"] = offer.period.value
                        payload["introPeriodUnit"] = periodUnit(offer.period.unit)
                        payload["introPaymentMode"] = paymentMode(offer.paymentMode)
                    } else {
                        payload["introAvailable"] = false
                    }
                }

                call.resolve(payload)
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc public func getEntitlement(_ call: CAPPluginCall) {
        Task {
            call.resolve(await entitlementPayload())
        }
    }

    @objc public func purchase(_ call: CAPPluginCall) {
        Task {
            do {
                guard let product = try await loadProduct() else {
                    throw RunluSubscriptionError.productUnavailable
                }

                switch try await product.purchase() {
                case .success(let result):
                    let transaction = try verified(result)
                    guard transaction.productID == productID else {
                        throw RunluSubscriptionError.unexpectedProduct
                    }
                    await transaction.finish()
                    var payload = await entitlementPayload()
                    payload["purchaseResult"] = "success"
                    call.resolve(payload)

                case .pending:
                    var payload = await entitlementPayload()
                    payload["purchaseResult"] = "pending"
                    call.resolve(payload)

                case .userCancelled:
                    var payload = await entitlementPayload()
                    payload["purchaseResult"] = "cancelled"
                    call.resolve(payload)

                @unknown default:
                    var payload = await entitlementPayload()
                    payload["purchaseResult"] = "unknown"
                    call.resolve(payload)
                }
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc public func restore(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
                var payload = await entitlementPayload()
                payload["restored"] = true
                call.resolve(payload)
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc public func manageSubscriptions(_ call: CAPPluginCall) {
        Task {
            do {
                let scene = await MainActor.run { () -> UIWindowScene? in
                    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
                    return scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first
                }
                guard let scene else { throw RunluSubscriptionError.noForegroundScene }
                try await AppStore.showManageSubscriptions(in: scene)
                call.resolve(["presented": true])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    private func loadProduct() async throws -> Product? {
        try await Product.products(for: [productID]).first(where: { $0.id == productID })
    }

    private func verified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .verified(let value):
            return value
        case .unverified:
            throw RunluSubscriptionError.verificationFailed
        }
    }

    private func entitlementPayload() async -> [String: Any] {
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else { continue }
            guard transaction.productID == productID else { continue }
            guard transaction.revocationDate == nil else { continue }
            if let expirationDate = transaction.expirationDate, expirationDate <= Date() { continue }

            var payload: [String: Any] = [
                "productId": productID,
                "entitled": true,
                "state": "active",
                "originalPurchaseDate": iso8601(transaction.originalPurchaseDate)
            ]
            if let expirationDate = transaction.expirationDate {
                payload["expirationDate"] = iso8601(expirationDate)
            }
            return payload
        }

        return [
            "productId": productID,
            "entitled": false,
            "state": "inactive"
        ]
    }

    private func iso8601(_ date: Date) -> String {
        ISO8601DateFormatter().string(from: date)
    }

    private func periodUnit(_ unit: Product.SubscriptionPeriod.Unit) -> String {
        switch unit {
        case .day: return "day"
        case .week: return "week"
        case .month: return "month"
        case .year: return "year"
        @unknown default: return "unknown"
        }
    }

    private func paymentMode(_ mode: Product.SubscriptionOffer.PaymentMode) -> String {
        switch mode {
        case .freeTrial: return "freeTrial"
        case .payAsYouGo: return "payAsYouGo"
        case .payUpFront: return "payUpFront"
        default: return "unknown"
        }
    }
}
