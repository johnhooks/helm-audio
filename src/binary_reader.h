#pragma once

#include <cstddef>
#include <cstdint>
#include <cstring>

namespace helm_audio {

/// Reads little-endian binary data from a flat byte buffer.
/// Matches the wire format produced by @helm-audio/protocol's Builder.
/// On overrun, returns zero. No exceptions.
class BinaryReader {
public:
    BinaryReader(const uint8_t* data, size_t length)
        : data_(data), length_(length) {}

    uint8_t ReadU8() {
        if (pos_ + 1 > length_) return 0;
        return data_[pos_++];
    }

    int8_t ReadI8() {
        if (pos_ + 1 > length_) return 0;
        return static_cast<int8_t>(data_[pos_++]);
    }

    float ReadF32() {
        if (pos_ + 4 > length_) return 0.0f;
        float val;
        std::memcpy(&val, data_ + pos_, 4);
        pos_ += 4;
        return val;
    }

    bool HasRemaining(size_t n) const { return pos_ + n <= length_; }
    size_t Position() const { return pos_; }
    size_t Length() const { return length_; }

private:
    const uint8_t* data_;
    size_t length_;
    size_t pos_ = 0;
};

} // namespace helm_audio
