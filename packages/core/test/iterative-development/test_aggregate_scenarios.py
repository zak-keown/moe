"""Unit tests for extract-requirements/scripts/aggregate_scenarios.py."""
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).parent.parent.parent / "skills" / "extract-requirements" / "scripts" / "aggregate_scenarios.py"


class TestAggregateScenarios(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.stories_dir = self.tmp / "stories"
        self.stories_dir.mkdir()
        self.output = self.tmp / "behavior-scenarios.md"

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _run(self, scenarios):
        json_file = self.tmp / "scenarios.json"
        json_file.write_text(json.dumps({"scenarios": scenarios}))
        return subprocess.run(
            [sys.executable, str(SCRIPT), "-o", str(self.output),
             "--stories-dir", str(self.stories_dir), str(json_file)],
            capture_output=True, text=True,
        )

    def test_script_exists(self):
        self.assertTrue(SCRIPT.exists())

    def test_distinct_untitled_scenarios_are_not_merged(self):
        """Two scenarios that both lack a title (e.g. because an extraction
        subagent failed to produce one) must both survive dedup. Keying
        solely on the stripped title merges them, silently discarding the
        second scenario's kind/preconditions/steps/final_observables and
        keeping only the first scenario's content."""
        scenarios = [
            {
                "title": "",
                "kind": "surface",
                "preconditions": ["user is signed in"],
                "steps": [{"action": "do the first thing", "expected": ["first result"]}],
                "final_observables": ["first observable"],
            },
            {
                "title": "",
                "kind": "surface",
                "preconditions": ["cart has items"],
                "steps": [{"action": "do the second thing", "expected": ["second result"]}],
                "final_observables": ["second observable"],
            },
        ]
        result = self._run(scenarios)
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        output = self.output.read_text()
        self.assertIn("do the first thing", output)
        self.assertIn("first result", output)
        self.assertIn("do the second thing", output)
        self.assertIn("second result", output)
        self.assertIn("second observable", output)


if __name__ == "__main__":
    unittest.main()
