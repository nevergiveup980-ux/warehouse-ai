import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let outputPath = CommandLine.arguments.dropFirst().first ?? "runlu-app-icon-1024.png"
let size = 1024
let colorSpace = CGColorSpaceCreateDeviceRGB()
let bitmapInfo = CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue)

guard let ctx = CGContext(
  data: nil,
  width: size,
  height: size,
  bitsPerComponent: 8,
  bytesPerRow: 0,
  space: colorSpace,
  bitmapInfo: bitmapInfo.rawValue
) else {
  fatalError("Unable to create icon context")
}

// Same RUNLU software-family treatment used by Universal Invoice:
// blue diagonal gradient with a simple white water-drop outline.
let start = CGColor(red: 60/255, green: 164/255, blue: 244/255, alpha: 1)
let end = CGColor(red: 12/255, green: 67/255, blue: 153/255, alpha: 1)
let gradient = CGGradient(colorsSpace: colorSpace, colors: [start, end] as CFArray, locations: [0, 1])!
ctx.drawLinearGradient(
  gradient,
  start: CGPoint(x: 0, y: CGFloat(size)),
  end: CGPoint(x: CGFloat(size), y: 0),
  options: []
)

let drop = CGMutablePath()
drop.move(to: CGPoint(x: 512, y: 806))
drop.addCurve(
  to: CGPoint(x: 360, y: 538),
  control1: CGPoint(x: 458, y: 732),
  control2: CGPoint(x: 382, y: 627)
)
drop.addCurve(
  to: CGPoint(x: 512, y: 234),
  control1: CGPoint(x: 327, y: 430),
  control2: CGPoint(x: 354, y: 234)
)
drop.addCurve(
  to: CGPoint(x: 664, y: 538),
  control1: CGPoint(x: 670, y: 234),
  control2: CGPoint(x: 697, y: 430)
)
drop.addCurve(
  to: CGPoint(x: 512, y: 806),
  control1: CGPoint(x: 642, y: 627),
  control2: CGPoint(x: 566, y: 732)
)

ctx.addPath(drop)
ctx.setStrokeColor(CGColor(gray: 1, alpha: 1))
ctx.setLineWidth(38)
ctx.setLineCap(.round)
ctx.setLineJoin(.round)
ctx.strokePath()

guard let image = ctx.makeImage() else {
  fatalError("Unable to render icon")
}

let outputURL = URL(fileURLWithPath: outputPath)
try? FileManager.default.createDirectory(at: outputURL.deletingLastPathComponent(), withIntermediateDirectories: true)

guard let destination = CGImageDestinationCreateWithURL(outputURL as CFURL, UTType.png.identifier as CFString, 1, nil) else {
  fatalError("Unable to create PNG destination")
}
CGImageDestinationAddImage(destination, image, nil)
guard CGImageDestinationFinalize(destination) else {
  fatalError("Unable to write PNG")
}

print("Generated RUNLU family App Icon: \(outputURL.path)")
