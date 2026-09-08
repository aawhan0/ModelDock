from app.core.security import _hash_key, _verify_key, generate_api_key


def test_api_key_hashes_use_argon2() -> None:
    raw_key = generate_api_key()
    stored_hash = _hash_key(raw_key)

    assert stored_hash.startswith("$argon2")
    assert _verify_key(stored_hash, raw_key)
    assert not _verify_key(stored_hash, "md_wrong")


def test_api_key_generation_is_unique_and_prefixed() -> None:
    first = generate_api_key()
    second = generate_api_key()

    assert first.startswith("md_")
    assert second.startswith("md_")
    assert first != second
