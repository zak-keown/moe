"""Unit tests for scripts/validate_skill.py."""
import sys
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).parent.parent.parent / "scripts" / "validate_skill.py"
FIXTURES = Path(__file__).parent / "fixtures"


class TestSkillValidator(unittest.TestCase):
    def run_skill(self, content: str) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as tmp:
            skill = Path(tmp) / "SKILL.md"
            skill.write_text(content)
            return subprocess.run(
                [sys.executable, str(SCRIPT), str(skill)],
                capture_output=True, text=True,
            )

    def test_script_exists(self):
        self.assertTrue(SCRIPT.exists())

    def test_valid_skill_passes(self):
        result = subprocess.run(
            [sys.executable, str(SCRIPT), str(FIXTURES / "skill.valid" / "SKILL-FIXTURE.md")],
            capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, msg=result.stderr)

    def test_missing_frontmatter_fails(self):
        result = subprocess.run(
            [sys.executable, str(SCRIPT),
             str(FIXTURES / "skill.invalid-no-frontmatter" / "SKILL-FIXTURE.md")],
            capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("frontmatter", result.stderr.lower())

    def test_bad_description_format_fails(self):
        result = subprocess.run(
            [sys.executable, str(SCRIPT),
             str(FIXTURES / "skill.invalid-bad-description" / "SKILL-FIXTURE.md")],
            capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("use when", result.stderr.lower())

    def test_quoted_frontmatter_scalars_pass(self):
        result = self.run_skill(
            '---\nname: "quoted-skill"\ndescription: "Use when quoted YAML is clearer"\n---\nBody.\n'
        )
        self.assertEqual(result.returncode, 0, msg=result.stderr)

    def test_folded_description_scalar_passes(self):
        result = self.run_skill(
            "---\nname: folded-skill\ndescription: >-\n  Use when a description wraps\n  across multiple lines\n---\nBody.\n"
        )
        self.assertEqual(result.returncode, 0, msg=result.stderr)


if __name__ == "__main__":
    unittest.main()
