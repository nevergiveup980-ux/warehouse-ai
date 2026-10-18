"""Contract tests for standalone RUNLU queue audit. No network or storage writes."""
import json
import unittest
from collections import defaultdict


def audit(outer):
    if (outer.get('format') != 'RUNLU Offline Queue Emergency Export'
            or outer.get('storageKey') != 'runlu_record_sync_outbox_v1'
            or not isinstance(outer.get('rawOutbox'), str)):
        raise ValueError('invalid export metadata')
    ops = json.loads(outer['rawOutbox'])
    if not isinstance(ops, list) or type(outer.get('operationCount')) is not int or outer['operationCount'] != len(ops):
        raise ValueError('invalid operation count')
    groups = defaultdict(list)
    ids = set()
    for index, op in enumerate(ops):
        if (not isinstance(op, dict) or any(not isinstance(op.get(k), str) for k in ('dataset_key', 'record_id', 'operation_id'))
                or type(op.get('delete')) is not bool):
            raise ValueError(f'invalid operation at {index}')
        if op['operation_id'] in ids:
            raise ValueError(f'duplicate operation ID at {index}')
        ids.add(op['operation_id'])
        groups[(op['dataset_key'], op['record_id'])].append(op)
    return {
        'operations': len(ops),
        'groups': len(groups),
        'groups_with_deletes': sum(any(op['delete'] for op in group) for group in groups.values()),
        'groups_with_transitions': sum(any(group[i]['delete'] != group[i-1]['delete'] for i in range(1, len(group))) for group in groups.values()),
        'repeated_groups': sum(len(group) > 1 for group in groups.values()),
    }


def sample(ops):
    return {'format': 'RUNLU Offline Queue Emergency Export', 'storageKey': 'runlu_record_sync_outbox_v1',
            'operationCount': len(ops), 'rawOutbox': json.dumps(ops)}


def op(ident, record='R1', delete=False):
    return {'operation_id': ident, 'dataset_key': 'inventory', 'record_id': record,
            'delete': delete, 'payload': {}, 'base_version': None}


class AuditTests(unittest.TestCase):
    def test_empty(self):
        self.assertEqual(audit(sample([]))['groups'], 0)

    def test_repeats_and_transitions(self):
        result = audit(sample([op('a'), op('b', delete=True), op('c')]))
        self.assertEqual(result['groups_with_transitions'], 1)
        self.assertEqual(result['groups_with_deletes'], 1)
        self.assertEqual(result['repeated_groups'], 1)

    def test_reject_duplicate_id(self):
        with self.assertRaises(ValueError): audit(sample([op('a'), op('a')]))

    def test_reject_mismatched_count(self):
        data = sample([op('a')]); data['operationCount'] = 2
        with self.assertRaises(ValueError): audit(data)

    def test_reject_bad_metadata(self):
        data = sample([]); data['storageKey'] = 'other'
        with self.assertRaises(ValueError): audit(data)

    def test_reject_malformed_operation(self):
        with self.assertRaises(ValueError): audit(sample([{'operation_id': 'x'}]))

    def test_reject_nonarray_outbox(self):
        data = sample([]); data['rawOutbox'] = '{}'
        with self.assertRaises(ValueError): audit(data)


if __name__ == '__main__':
    unittest.main()
