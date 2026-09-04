"""Unit tests for extracting-requirements/scripts/chunk_spec.py."""
import sys
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).parent.parent.parent / "skills" / "extracting-requirements" / "scripts" / "chunk_spec.py"


class TestChunkSpec(unittest.TestCase):
    def test_script_exists(self):
        self.assertTrue(SCRIPT.exists())

    def test_small_file_is_single_chunk(self):
        """A file under the token threshold should produce exactly one chunk."""
        with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False) as f:
            f.write("# Small Spec\n\nJust a few words here.\n")
            tmp = f.name
        try:
            result = subprocess.run(
                [sys.executable, str(SCRIPT), tmp],
                capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 0, msg=result.stderr)
            chunks = json.loads(result.stdout)
            self.assertEqual(len(chunks), 1)
            self.assertIn("Small Spec", chunks[0]["content"])
            self.assertEqual(chunks[0]["source_file"], tmp)
        finally:
            Path(tmp).unlink()

    def test_file_with_headings_splits_by_h2(self):
        """A file over the token threshold with ## headings should split by heading."""
        # Create content big enough to trigger splitting (>3K words ≈ >4K tokens)
        section_a = "## Section A\n\n" + ("word " * 2000) + "\n\n"
        section_b = "## Section B\n\n" + ("word " * 2000) + "\n\n"
        content = "# Big Spec\n\nPreamble text.\n\n" + section_a + section_b

        with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False) as f:
            f.write(content)
            tmp = f.name
        try:
            result = subprocess.run(
                [sys.executable, str(SCRIPT), tmp, "--max-tokens", "3000"],
                capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 0, msg=result.stderr)
            chunks = json.loads(result.stdout)
            # Should have preamble + Section A + Section B = 3 chunks
            self.assertGreaterEqual(len(chunks), 2)
            headings = [c["heading"] for c in chunks]
            self.assertIn("Section A", headings)
            self.assertIn("Section B", headings)
        finally:
            Path(tmp).unlink()

    def test_directory_processes_all_md_files(self):
        """A directory should produce chunks from all .md files in it."""
        with tempfile.TemporaryDirectory() as tmpdir:
            (Path(tmpdir) / "a.md").write_text("# File A\n\nContent A.\n")
            (Path(tmpdir) / "b.md").write_text("# File B\n\nContent B.\n")
            (Path(tmpdir) / "c.txt").write_text("Not markdown, should be ignored.\n")

            result = subprocess.run(
                [sys.executable, str(SCRIPT), tmpdir],
                capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 0, msg=result.stderr)
            chunks = json.loads(result.stdout)
            source_files = {c["source_file"] for c in chunks}
            self.assertEqual(len(source_files), 2)  # only .md files
            self.assertTrue(all("Content" in c["content"] for c in chunks))

    def test_missing_path_returns_error(self):
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "/tmp/does-not-exist-99999"],
            capture_output=True, text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("not found", result.stderr.lower())

    def test_each_chunk_has_required_fields(self):
        """Every chunk must have source_file, heading, start_line, end_line, content, estimated_tokens."""
        with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False) as f:
            f.write("# Test\n\nHello world.\n")
            tmp = f.name
        try:
            result = subprocess.run(
                [sys.executable, str(SCRIPT), tmp],
                capture_output=True, text=True,
            )
            chunks = json.loads(result.stdout)
            for chunk in chunks:
                for field in ("source_file", "heading", "start_line", "end_line",
                              "content", "estimated_tokens"):
                    self.assertIn(field, chunk, f"missing field: {field}")
        finally:
            Path(tmp).unlink()


    def test_large_section_splits_by_h3(self):
        """A section over the token threshold should sub-split by ### headings."""
        # Create a file with one ## section that's too big, containing ### subsections
        sub_a = "### Sub A\n\n" + ("word " * 1500) + "\n\n"
        sub_b = "### Sub B\n\n" + ("word " * 1500) + "\n\n"
        content = "# Big Doc\n\n## Large Section\n\n" + sub_a + sub_b

        with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False) as f:
            f.write(content)
            tmp = f.name
        try:
            result = subprocess.run(
                [sys.executable, str(SCRIPT), tmp, "--max-tokens", "2000"],
                capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 0, msg=result.stderr)
            chunks = json.loads(result.stdout)
            # Should have sub-split: at least 2 chunks from the ### subsections
            self.assertGreaterEqual(len(chunks), 2)
            headings = [c["heading"] for c in chunks]
            # Headings should show parent > child format
            self.assertTrue(
                any("Sub A" in h for h in headings if h),
                f"Expected 'Sub A' in headings, got {headings}",
            )
            self.assertTrue(
                any("Sub B" in h for h in headings if h),
                f"Expected 'Sub B' in headings, got {headings}",
            )
        finally:
            Path(tmp).unlink()

    def test_duplicate_heading_shared_opening_gets_correct_line_range(self):
        """Two ### subsections that share the same heading text and the same
        opening 80 characters of content (e.g. a repeated boilerplate
        sentence under a recurring '### Notes' heading) must each be
        attributed to their own line range, not both to the first one's."""
        shared_opening = (
            "Refer to the shared appendix for full details on error "
            "handling semantics here. "
        )
        filler = "word " * 800
        section_a = (
            "## Feature One\n\n" + filler + "\n\n"
            "### Notes\n\n" + shared_opening + ("alpha " * 800) + "\n\n"
        )
        section_b = (
            "## Feature Two\n\n" + filler + "\n\n"
            "### Notes\n\n" + shared_opening + ("beta " * 800) + "\n\n"
        )
        content = "# Spec\n\n" + section_a + section_b

        with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False) as f:
            f.write(content)
            tmp = f.name
        try:
            result = subprocess.run(
                [sys.executable, str(SCRIPT), tmp, "--max-tokens", "500"],
                capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 0, msg=result.stderr)
            chunks = json.loads(result.stdout)
            notes_chunks = [c for c in chunks if c["heading"] and c["heading"].endswith("Notes")]
            self.assertEqual(len(notes_chunks), 2, f"expected 2 Notes chunks, got {notes_chunks}")

            true_notes_lines = [
                i + 1 for i, line in enumerate(content.splitlines()) if line.strip() == "### Notes"
            ]
            self.assertEqual(len(true_notes_lines), 2)

            reported_starts = sorted(c["start_line"] for c in notes_chunks)
            self.assertEqual(
                reported_starts, true_notes_lines,
                "the second '### Notes' section was misattributed to the first "
                "section's line range instead of its own",
            )
        finally:
            Path(tmp).unlink()


if __name__ == "__main__":
    unittest.main()
