import os
import unittest
from unittest.mock import patch
from media_service.gpu_admission import (
    GPUAdmissionDenied, assert_gpu_admitted, gpu_free_memory_mib, required_free_mib
)

class AdmissionTests(unittest.TestCase):
    def test_defaults(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(required_free_mib("transcription"), 2048)
            self.assertEqual(required_free_mib("image"), 10240)
            self.assertEqual(required_free_mib("video"), 14336)

    def test_denies_when_insufficient_vram(self):
        with patch("media_service.gpu_admission.gpu_free_memory_mib", return_value=1024):
            with self.assertRaises(GPUAdmissionDenied):
                assert_gpu_admitted("transcription")

    def test_allows_when_sufficient(self):
        with patch("media_service.gpu_admission.gpu_free_memory_mib", return_value=12000):
            self.assertEqual(assert_gpu_admitted("image"), 12000)

    def test_invalid_config_fails_closed(self):
        with patch.dict(os.environ, {"GPU_MEDIA_MIN_FREE_MIB_VIDEO": "not-a-number"}):
            with self.assertRaises(GPUAdmissionDenied):
                required_free_mib("video")

    def test_unsupported_kind(self):
        with self.assertRaises(GPUAdmissionDenied):
            required_free_mib("unknown")

    def test_telemetry_failure_fails_closed(self):
        with patch("media_service.gpu_admission.subprocess.run", side_effect=FileNotFoundError):
            with self.assertRaises(GPUAdmissionDenied):
                gpu_free_memory_mib()

if __name__ == "__main__":
    unittest.main()
