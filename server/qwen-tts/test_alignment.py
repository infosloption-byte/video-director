import unittest

from alignment import align_word_timestamps, proportional_timestamps


class AlignmentTests(unittest.TestCase):
    def test_exact_transcript_uses_audio_word_times(self):
        result = align_word_timestamps(
            "Helix makes videos",
            [
                {"word": "Helix", "start": 0.20, "end": 0.55},
                {"word": "makes", "start": 0.60, "end": 0.96},
                {"word": "videos", "start": 1.02, "end": 1.48},
            ],
            1.60,
        )
        self.assertEqual(result, [
            {"word": "Helix", "start": 0.2, "end": 0.55},
            {"word": "makes", "start": 0.6, "end": 0.96},
            {"word": "videos", "start": 1.02, "end": 1.48},
        ])

    def test_punctuation_differences_still_match(self):
        result = align_word_timestamps(
            "Helix, makes videos.",
            [
                {"word": "Helix", "start": 0.10, "end": 0.40},
                {"word": "makes", "start": 0.45, "end": 0.76},
                {"word": "videos", "start": 0.82, "end": 1.14},
            ],
            1.20,
        )
        self.assertEqual(result[0]["word"], "Helix,")
        self.assertAlmostEqual(result[0]["start"], 0.10)
        self.assertAlmostEqual(result[2]["end"], 1.14)

    def test_replaced_words_are_interpolated_only_inside_audio_span(self):
        result = align_word_timestamps(
            "alpha beta gamma",
            [
                {"word": "alpha", "start": 0.10, "end": 0.40},
                {"word": "delta", "start": 0.50, "end": 0.75},
                {"word": "gamma", "start": 0.85, "end": 1.10},
            ],
            1.20,
        )
        self.assertEqual(result[0], {"word": "alpha", "start": 0.1, "end": 0.4})
        self.assertEqual(result[2], {"word": "gamma", "start": 0.85, "end": 1.1})
        self.assertGreaterEqual(result[1]["start"], 0.4)
        self.assertLessEqual(result[1]["end"], 0.85)

    def test_empty_transcript_uses_proportional_fallback(self):
        result = align_word_timestamps("one two", [], 2.0)
        self.assertEqual(result, proportional_timestamps(["one", "two"], 0.0, 2.0))
        self.assertEqual(result[-1]["end"], 2.0)


if __name__ == "__main__":
    unittest.main()
