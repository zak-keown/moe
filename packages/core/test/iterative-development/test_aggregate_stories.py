"""Unit tests for extracting-requirements/scripts/aggregate_stories.py."""
import sys
import json
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).parent.parent.parent / "skills" / "extracting-requirements" / "scripts" / "aggregate_stories.py"
FIXTURES = Path(__file__).parent / "fixtures"
VALIDATOR = Path(__file__).parent.parent.parent / "skills" / "extracting-requirements" / "scripts" / "validate_requirements_index.py"


class TestAggregateStories(unittest.TestCase):
    def setUp(self):
        self.out_dir = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.out_dir, ignore_errors=True)

    def _run(self, *extra_args):
        return subprocess.run(
            [sys.executable, str(SCRIPT), "-o", str(self.out_dir), *extra_args],
            capture_output=True, text=True,
        )

    def _read_all(self) -> str:
        """Read all .md files in output dir concatenated."""
        parts = []
        for f in sorted(self.out_dir.glob("*.md")):
            parts.append(f.read_text())
        return "\n".join(parts)

    def test_script_exists(self):
        self.assertTrue(SCRIPT.exists())

    def test_sample_fixture_produces_valid_output(self):
        """Aggregating the sample fixture should produce valid per-epic files."""
        result = self._run(str(FIXTURES / "extracted-stories-sample.json"))
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        # Should create epic files
        epic_files = list(self.out_dir.glob("EPIC-*.md"))
        self.assertGreater(len(epic_files), 0)
        # Validate the output directory
        val_result = subprocess.run(
            [sys.executable, str(VALIDATOR), str(self.out_dir)],
            capture_output=True, text=True,
        )
        self.assertEqual(val_result.returncode, 0,
                         msg=f"Validator failed: {val_result.stderr}")

    def test_dedup_merges_duplicate_titles(self):
        """Stories with identical titles should be merged, sources combined."""
        stories = [
            {
                "title": "Same Story",
                "epic_theme": "Test",
                "as_a": "user", "i_want": "x", "so_that": "y",
                "acceptance_criteria": ["AC-1: test"],
                "sources": [{"file": "a.md", "lines": "1-5"}]
            },
            {
                "title": "Same Story",
                "epic_theme": "Test",
                "as_a": "user", "i_want": "x", "so_that": "y",
                "acceptance_criteria": ["AC-1: test"],
                "sources": [{"file": "b.md", "lines": "10-15"}]
            },
        ]
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(stories, f)
            tmp = f.name
        try:
            result = self._run(tmp)
            self.assertEqual(result.returncode, 0, msg=result.stderr)
            output = self._read_all()
            # Should have exactly ONE STORY (deduped)
            self.assertEqual(output.count("## STORY-"), 1)
            # But should cite both sources
            self.assertIn("a.md", output)
            self.assertIn("b.md", output)
        finally:
            Path(tmp).unlink()

    def test_dedup_does_not_merge_same_title_across_different_epics(self):
        """Two distinct requirements that happen to share a short title must
        NOT collapse into one just because dedup keys on title alone — the
        losing epic's requirement (and its citation) must not vanish."""
        stories = [
            {
                "title": "Validate input",
                "epic_theme": "Auth",
                "as_a": "user", "i_want": "my password checked for strength",
                "so_that": "my account is secure",
                "acceptance_criteria": ["AC-1: reject weak passwords"],
                "sources": [{"file": "domain-users.md", "lines": "12-20"}],
            },
            {
                "title": "Validate input",
                "epic_theme": "Billing",
                "as_a": "user", "i_want": "my card number Luhn-checked",
                "so_that": "typos are caught before charging",
                "acceptance_criteria": ["AC-1: reject invalid card numbers"],
                "sources": [{"file": "domain-billing.md", "lines": "30-41"}],
            },
        ]
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(stories, f)
            tmp = f.name
        try:
            result = self._run(tmp)
            self.assertEqual(result.returncode, 0, msg=result.stderr)

            # Read each epic file individually rather than checking the
            # concatenation of all of them — a substring window sliced out
            # of the combined text (e.g. `output[idx - 2000:]`) can silently
            # span both files, so a check against it stays true even when
            # every story lands in a single, wrongly-shared epic file. Two
            # distinct files is itself part of the regression guard.
            epic_files = sorted(self.out_dir.glob("EPIC-*.md"))
            self.assertEqual(
                len(epic_files), 2,
                f"expected one epic file per theme (Auth, Billing), got {epic_files}",
            )
            contents = {f: f.read_text() for f in epic_files}
            auth_file = next((f for f, c in contents.items() if "domain-users.md" in c), None)
            billing_file = next((f for f, c in contents.items() if "domain-billing.md" in c), None)
            self.assertIsNotNone(auth_file, "no epic file cites domain-users.md")
            self.assertIsNotNone(billing_file, "no epic file cites domain-billing.md")
            self.assertNotEqual(
                auth_file, billing_file,
                "the Auth and Billing citations landed in the same epic file",
            )

            auth_content = contents[auth_file]
            billing_content = contents[billing_file]

            # Both requirements must survive as distinct stories.
            self.assertEqual(auth_content.count("## STORY-") + billing_content.count("## STORY-"), 2)

            # The Billing story must not be misattributed to the Auth epic:
            # its own file carries "card", and — the part a whole-document
            # substring search can't see — the Auth epic's file must not.
            self.assertIn("card", billing_content.lower())
            self.assertNotIn("card", auth_content.lower())
            self.assertIn("password", auth_content.lower())
            self.assertNotIn("password", billing_content.lower())
        finally:
            Path(tmp).unlink()

    def test_dedup_does_not_merge_same_title_with_different_bodies(self):
        """Same title AND same epic, but different i_want/AC, is still a
        title collision between two different requirements, not a duplicate."""
        stories = [
            {
                "title": "Validate input",
                "epic_theme": "Auth",
                "as_a": "user", "i_want": "password strength checked",
                "so_that": "accounts are secure",
                "acceptance_criteria": ["AC-1: reject weak passwords"],
                "sources": [{"file": "a.md", "lines": "1-5"}],
            },
            {
                "title": "Validate input",
                "epic_theme": "Auth",
                "as_a": "user", "i_want": "email format checked",
                "so_that": "notifications are deliverable",
                "acceptance_criteria": ["AC-1: reject malformed email"],
                "sources": [{"file": "b.md", "lines": "10-15"}],
            },
        ]
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(stories, f)
            tmp = f.name
        try:
            result = self._run(tmp)
            self.assertEqual(result.returncode, 0, msg=result.stderr)
            output = self._read_all()
            self.assertEqual(output.count("## STORY-"), 2)
            self.assertIn("a.md", output)
            self.assertIn("b.md", output)
        finally:
            Path(tmp).unlink()

    def test_empty_titles_are_never_merged(self):
        """format_epic_file defends against a missing title with 'Untitled',
        but dedup must not treat that shared fallback as a match key."""
        stories = [
            {"title": "", "epic_theme": "Misc", "sources": [{"file": "a.md"}]},
            {"title": "", "epic_theme": "Misc", "sources": [{"file": "b.md"}]},
            {"title": "", "epic_theme": "Misc", "sources": [{"file": "c.md"}]},
        ]
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(stories, f)
            tmp = f.name
        try:
            result = self._run(tmp)
            self.assertEqual(result.returncode, 0, msg=result.stderr)
            output = self._read_all()
            self.assertEqual(output.count("## STORY-"), 3)
        finally:
            Path(tmp).unlink()

    def test_reaggregation_removes_stale_epics_and_duplicate_ids(self):
        """Re-aggregating a smaller/different input into the same output dir
        (the documented SKILL.md workflow) must not leave a stale epic file
        behind, and must not produce duplicate story IDs across files."""
        first_pass = [
            {"title": "A1", "epic_theme": "Epic A", "sources": []},
            {"title": "B1", "epic_theme": "Epic B", "sources": []},
            {"title": "C1", "epic_theme": "Epic C", "sources": []},
        ]
        second_pass = [
            {"title": "A2", "epic_theme": "Epic A", "sources": []},
            {"title": "B2", "epic_theme": "Epic A", "sources": []},
            {"title": "B3", "epic_theme": "Epic A", "sources": []},
        ]
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(first_pass, f)
            tmp1 = f.name
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(second_pass, f)
            tmp2 = f.name
        try:
            result1 = self._run(tmp1)
            self.assertEqual(result1.returncode, 0, msg=result1.stderr)
            result2 = self._run(tmp2)
            self.assertEqual(result2.returncode, 0, msg=result2.stderr)

            epic_files = sorted(f.name for f in self.out_dir.glob("EPIC-*.md"))
            self.assertEqual(epic_files, ["EPIC-001.md"], msg=f"stale epic files left behind: {epic_files}")

            output = self._read_all()
            story_ids = re.findall(r"## (STORY-\d+)", output)
            self.assertEqual(len(story_ids), len(set(story_ids)), msg=f"duplicate story IDs: {story_ids}")
        finally:
            Path(tmp1).unlink()
            Path(tmp2).unlink()

    def test_epics_grouped_into_separate_files(self):
        """Stories with different epic_themes get separate files."""
        result = self._run(str(FIXTURES / "extracted-stories-sample.json"))
        # Sample has 2 themes: "Task Management" and "Billing"
        epic_files = sorted(self.out_dir.glob("EPIC-*.md"))
        self.assertEqual(len(epic_files), 2)

    def test_story_ids_are_sequential(self):
        """Story IDs should be assigned sequentially starting from 0001."""
        self._run(str(FIXTURES / "extracted-stories-sample.json"))
        output = self._read_all()
        story_ids = re.findall(r"## STORY-(\d+)", output)
        self.assertEqual(story_ids, ["0001", "0002", "0003", "0004", "0005"])

    def test_no_input_returns_error(self):
        result = subprocess.run(
            [sys.executable, str(SCRIPT)],
            capture_output=True, text=True,
        )
        self.assertNotEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
