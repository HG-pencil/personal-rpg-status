import os
import sys
import unittest

# Add parent directory to path to import status.py
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import status

class TestMergeAndMigration(unittest.TestCase):
    def setUp(self):
        # Basic status template
        self.base_data = {
            "last_updated": "2026-06-21T00:00:00",
            "combat_power": 700,
            "status": {
                "STR": {"current": 100, "peak": 100},
                "VIT": {"current": 100, "peak": 100},
                "INT": {"current": 100, "peak": 100},
                "WIS": {"current": 100, "peak": 100},
                "MND": {"current": 100, "peak": 100},
                "CHA": {"current": 100, "peak": 100},
                "DEV": {"current": 100, "peak": 100}
            }
        }

    def test_migration_injects_last_measured_at(self):
        # Data without last_measured_at
        raw_data = {
            "status": {
                "STR": {"current": 300, "peak": 300, "last_measured": "2026-06-09"},
                "VIT": {"current": 220, "peak": 220, "last_measured": "2026-06-09"}
            }
        }
        migrated = status.migrate_data(raw_data)
        
        # Verify last_measured_at is injected for all 7 params
        params = ["STR", "VIT", "INT", "WIS", "MND", "CHA", "DEV"]
        for p in params:
            self.assertIn("last_measured_at", migrated["status"][p])
            self.assertEqual(migrated["status"][p]["last_measured_at"], "2026-06-21T00:00:00")

    def test_merge_timestamp_priority_local_newer(self):
        # Case: Local has newer timestamp but lower current value (downgrade)
        # Cloud: INT current 360, peak 360, measured at 2026-06-21T00:00:00
        # Local: INT current 330, peak 360, measured at 2026-06-21T12:00:00
        cloud = {
            "status": {
                "STR": {"current": 100, "peak": 100, "last_measured_at": "2026-06-21T00:00:00"},
                "VIT": {"current": 100, "peak": 100, "last_measured_at": "2026-06-21T00:00:00"},
                "INT": {"current": 360, "peak": 360, "last_measured_at": "2026-06-21T00:00:00"},
                "WIS": {"current": 100, "peak": 100, "last_measured_at": "2026-06-21T00:00:00"},
                "MND": {"current": 100, "peak": 100, "last_measured_at": "2026-06-21T00:00:00"},
                "CHA": {"current": 100, "peak": 100, "last_measured_at": "2026-06-21T00:00:00"},
                "DEV": {"current": 100, "peak": 100, "last_measured_at": "2026-06-21T00:00:00"}
            }
        }
        local = {
            "status": {
                "STR": {"current": 100, "peak": 100, "last_measured_at": "2026-06-21T00:00:00"},
                "VIT": {"current": 100, "peak": 100, "last_measured_at": "2026-06-21T00:00:00"},
                "INT": {"current": 330, "peak": 360, "last_measured_at": "2026-06-21T12:00:00"},
                "WIS": {"current": 100, "peak": 100, "last_measured_at": "2026-06-21T00:00:00"},
                "MND": {"current": 100, "peak": 100, "last_measured_at": "2026-06-21T00:00:00"},
                "CHA": {"current": 100, "peak": 100, "last_measured_at": "2026-06-21T00:00:00"},
                "DEV": {"current": 100, "peak": 100, "last_measured_at": "2026-06-21T00:00:00"}
            }
        }
        
        merged = status.merge_status_data(cloud, local, self.base_data)
        
        # Verify local downgrade values are retained due to newer timestamp
        self.assertEqual(merged["status"]["INT"]["current"], 330)
        # Peak must maintain the maximum value
        self.assertEqual(merged["status"]["INT"]["peak"], 360)
        self.assertEqual(merged["status"]["INT"]["last_measured_at"], "2026-06-21T12:00:00")
        
        # Combat power must be recalculated: 100*6 + 330 = 930
        self.assertEqual(merged["combat_power"], 930)

    def test_merge_timestamp_priority_cloud_newer(self):
        # Case: Cloud has newer timestamp and higher value
        # Cloud: INT current 360, peak 360, measured at 2026-06-21T12:00:00
        # Local: INT current 330, peak 360, measured at 2026-06-21T00:00:00
        cloud = {
            "status": {
                "STR": {"current": 100, "peak": 100, "last_measured_at": "2026-06-21T00:00:00"},
                "VIT": {"current": 100, "peak": 100, "last_measured_at": "2026-06-21T00:00:00"},
                "INT": {"current": 360, "peak": 360, "last_measured_at": "2026-06-21T12:00:00"},
                "WIS": {"current": 100, "peak": 100, "last_measured_at": "2026-06-21T00:00:00"},
                "MND": {"current": 100, "peak": 100, "last_measured_at": "2026-06-21T00:00:00"},
                "CHA": {"current": 100, "peak": 100, "last_measured_at": "2026-06-21T00:00:00"},
                "DEV": {"current": 100, "peak": 100, "last_measured_at": "2026-06-21T00:00:00"}
            }
        }
        local = {
            "status": {
                "STR": {"current": 100, "peak": 100, "last_measured_at": "2026-06-21T00:00:00"},
                "VIT": {"current": 100, "peak": 100, "last_measured_at": "2026-06-21T00:00:00"},
                "INT": {"current": 330, "peak": 360, "last_measured_at": "2026-06-21T00:00:00"},
                "WIS": {"current": 100, "peak": 100, "last_measured_at": "2026-06-21T00:00:00"},
                "MND": {"current": 100, "peak": 100, "last_measured_at": "2026-06-21T00:00:00"},
                "CHA": {"current": 100, "peak": 100, "last_measured_at": "2026-06-21T00:00:00"},
                "DEV": {"current": 100, "peak": 100, "last_measured_at": "2026-06-21T00:00:00"}
            }
        }
        
        merged = status.merge_status_data(cloud, local, self.base_data)
        
        # Verify cloud newer values are selected
        self.assertEqual(merged["status"]["INT"]["current"], 360)
        self.assertEqual(merged["status"]["INT"]["peak"], 360)
        self.assertEqual(merged["status"]["INT"]["last_measured_at"], "2026-06-21T12:00:00")
        
        # Combat power must be recalculated: 100*6 + 360 = 960
        self.assertEqual(merged["combat_power"], 960)

if __name__ == "__main__":
    unittest.main()
