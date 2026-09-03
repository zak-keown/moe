"""Unit tests for per-skill artifact validators."""
import sys
import subprocess
import unittest
from pathlib import Path

SKILLS = Path(__file__).parent.parent.parent / "skills"
FIXTURES = Path(__file__).parent / "fixtures"

VALIDATE_ROADMAP = SKILLS / "scoping-the-simplest-core" / "scripts" / "validate_roadmap.py"
VALIDATE_ITER_LOG = SKILLS / "running-an-iteration" / "scripts" / "validate_iteration_log.py"


class TestRoadmapValidator(unittest.TestCase):
    def test_script_exists(self):
        self.assertTrue(VALIDATE_ROADMAP.exists())

    def test_valid_example_passes(self):
        result = subprocess.run(
            [sys.executable, str(VALIDATE_ROADMAP),
             str(FIXTURES / "roadmap.example.md")],
            capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, msg=result.stderr)

    def test_invalid_example_fails(self):
        result = subprocess.run(
            [sys.executable, str(VALIDATE_ROADMAP),
             str(FIXTURES / "roadmap.invalid.md")],
            capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 1)

    def test_missing_walking_skeleton_is_flagged(self):
        import tempfile, os
        content = (FIXTURES / "roadmap.example.md").read_text()
        broken = content.replace("## Walking skeleton (ITER-0000)", "## Other thing")
        with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False) as f:
            f.write(broken)
            tmp = f.name
        try:
            result = subprocess.run(
                [sys.executable, str(VALIDATE_ROADMAP), tmp],
                capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 1)
            self.assertIn("walking skeleton", result.stderr.lower())
        finally:
            os.unlink(tmp)


class TestIterationLogValidator(unittest.TestCase):
    def test_script_exists(self):
        self.assertTrue(VALIDATE_ITER_LOG.exists())

    def test_valid_example_passes(self):
        result = subprocess.run(
            [sys.executable, str(VALIDATE_ITER_LOG),
             str(FIXTURES / "iteration-log.example.md")],
            capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, msg=result.stderr)

    def test_invalid_example_fails(self):
        result = subprocess.run(
            [sys.executable, str(VALIDATE_ITER_LOG),
             str(FIXTURES / "iteration-log.invalid.md")],
            capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 1)


if __name__ == "__main__":
    unittest.main()
