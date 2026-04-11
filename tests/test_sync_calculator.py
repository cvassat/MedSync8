import unittest
from datetime import datetime, timedelta

from sync_calculator import calculate_sync_quantities


class TestCalculateSyncQuantities(unittest.TestCase):

    def _sync_date_str(self, days_from_now):
        return (datetime.today() + timedelta(days=days_from_now)).strftime("%Y-%m-%d")

    def test_basic_sync_calculation(self):
        meds = [
            {'name': 'MedA', 'daily_dose': 2, 'remaining': 20},
        ]
        new_med = {'name': 'MedB', 'daily_dose': 1}
        sync_date = self._sync_date_str(30)

        results = calculate_sync_quantities(meds, new_med, sync_date)

        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]['name'], 'MedA')
        self.assertEqual(results[0]['days_left'], 10)  # 20 // 2
        self.assertEqual(results[0]['units_needed'], 40)  # (30 - 10) * 2
        self.assertEqual(results[1]['name'], 'MedB (new)')
        self.assertEqual(results[1]['units_needed'], 30)  # 1 * 30

    def test_no_additional_units_needed(self):
        meds = [
            {'name': 'MedA', 'daily_dose': 1, 'remaining': 100},
        ]
        new_med = {'name': 'MedB', 'daily_dose': 1}
        sync_date = self._sync_date_str(10)

        results = calculate_sync_quantities(meds, new_med, sync_date)

        self.assertEqual(results[0]['units_needed'], 0)

    def test_past_sync_date_returns_empty(self):
        meds = [{'name': 'MedA', 'daily_dose': 1, 'remaining': 10}]
        new_med = {'name': 'MedB', 'daily_dose': 1}
        past_date = (datetime.today() - timedelta(days=5)).strftime("%Y-%m-%d")

        results = calculate_sync_quantities(meds, new_med, past_date)

        self.assertEqual(results, [])

    def test_zero_daily_dose_skipped(self):
        meds = [
            {'name': 'MedA', 'daily_dose': 0, 'remaining': 10},
            {'name': 'MedB', 'daily_dose': 2, 'remaining': 20},
        ]
        new_med = {'name': 'MedC', 'daily_dose': 1}
        sync_date = self._sync_date_str(30)

        results = calculate_sync_quantities(meds, new_med, sync_date)

        # MedA (dose=0) should be skipped
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]['name'], 'MedB')

    def test_multiple_medications(self):
        meds = [
            {'name': 'MedA', 'daily_dose': 1, 'remaining': 5},
            {'name': 'MedB', 'daily_dose': 3, 'remaining': 30},
        ]
        new_med = {'name': 'MedC', 'daily_dose': 2}
        sync_date = self._sync_date_str(20)

        results = calculate_sync_quantities(meds, new_med, sync_date)

        self.assertEqual(len(results), 3)
        # MedA: days_left=5, additional=15, units=15
        self.assertEqual(results[0]['units_needed'], 15)
        # MedB: days_left=10, additional=10, units=30
        self.assertEqual(results[1]['units_needed'], 30)
        # MedC (new): units=40
        self.assertEqual(results[2]['units_needed'], 40)

    def test_empty_current_meds(self):
        meds = []
        new_med = {'name': 'MedA', 'daily_dose': 2}
        sync_date = self._sync_date_str(10)

        results = calculate_sync_quantities(meds, new_med, sync_date)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['name'], 'MedA (new)')
        self.assertEqual(results[0]['units_needed'], 20)

    def test_new_med_zero_dose_skipped(self):
        meds = [{'name': 'MedA', 'daily_dose': 1, 'remaining': 10}]
        new_med = {'name': 'MedB', 'daily_dose': 0}
        sync_date = self._sync_date_str(20)

        results = calculate_sync_quantities(meds, new_med, sync_date)

        # Only MedA should be in results, MedB (dose=0) skipped
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['name'], 'MedA')


if __name__ == '__main__':
    unittest.main()
