from difflib import SequenceMatcher


def normalize_token(value: str) -> str:
    return "".join(char.lower() for char in value if char.isalnum())


def proportional_timestamps(original_words: list[str], start: float, end: float):
    if not original_words or end <= start:
        return []
    weights = [max(1, len(normalize_token(word))) for word in original_words]
    total = sum(weights)
    cursor = start
    result = []
    for index, word in enumerate(original_words):
        next_cursor = end if index == len(original_words) - 1 else cursor + (end - start) * weights[index] / total
        result.append({"word": word, "start": round(cursor, 3), "end": round(next_cursor, 3)})
        cursor = next_cursor
    return result


def align_word_timestamps(text: str, transcript_words: list[dict], duration_seconds: float):
    original_words = str(text).strip().split()
    if not original_words:
        return []
    if not transcript_words:
        return proportional_timestamps(original_words, 0.0, duration_seconds)

    original_tokens = [normalize_token(word) for word in original_words]
    transcript_tokens = [normalize_token(word["word"]) for word in transcript_words]
    result: list[dict | None] = [None] * len(original_words)

    matcher = SequenceMatcher(None, original_tokens, transcript_tokens, autojunk=False)
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            for offset in range(i2 - i1):
                source = transcript_words[j1 + offset]
                result[i1 + offset] = {
                    "word": original_words[i1 + offset],
                    "start": round(float(source["start"]), 3),
                    "end": round(float(source["end"]), 3),
                }
            continue

        if i1 == i2:
            continue

        span_start = float(transcript_words[j1]["start"]) if j1 < len(transcript_words) else None
        span_end = float(transcript_words[j2 - 1]["end"]) if j2 > j1 else None
        previous = next((item for item in reversed(result[:i1]) if item), None)
        following = next((item for item in result[i2:] if item), None)
        if span_start is None:
            span_start = float(previous["end"]) if previous else 0.0
        if span_end is None:
            span_end = float(following["start"]) if following else duration_seconds
        if span_end < span_start:
            span_end = span_start
        result[i1:i2] = proportional_timestamps(original_words[i1:i2], span_start, span_end)

    for index, item in enumerate(result):
        if item is not None:
            continue
        previous = next((entry for entry in reversed(result[:index]) if entry), None)
        following = next((entry for entry in result[index + 1:] if entry), None)
        start = float(previous["end"]) if previous else 0.0
        end = float(following["start"]) if following else duration_seconds
        result[index] = {
            "word": original_words[index],
            "start": round(start, 3),
            "end": round(max(start, end), 3),
        }

    return result
