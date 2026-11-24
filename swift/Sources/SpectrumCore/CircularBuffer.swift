import Foundation

/// Fixed-size circular ring buffer holding the most recent PCM audio samples.
public struct CircularBuffer: Sendable {
    public let capacity: Int
    private var buffer: [Float]
    private var writeIndex: Int = 0
    private var count: Int = 0

    public init(capacity: Int = 2048) {
        self.capacity = max(1, capacity)
        self.buffer = [Float](repeating: 0.0, count: self.capacity)
    }

    /// Pushes new audio samples into the buffer.
    public mutating func push(_ samples: [Float]) {
        guard !samples.isEmpty else { return }
        for sample in samples {
            buffer[writeIndex] = sample
            writeIndex = (writeIndex + 1) % capacity
            if count < capacity {
                count += 1
            }
        }
    }

    /// Returns the most recent `capacity` samples in chronological order (oldest to newest).
    /// If fewer samples have been pushed, the oldest portion is zero-padded.
    public func snapshot() -> [Float] {
        var result = [Float](repeating: 0.0, count: capacity)
        if count == 0 {
            return result
        }

        if count < capacity {
            // Buffer is not full yet: prefix remains zero, suffix contains samples from 0 to count-1
            let start = capacity - count
            for i in 0..<count {
                result[start + i] = buffer[i]
            }
        } else {
            // Buffer is full: oldest sample is at writeIndex
            for i in 0..<capacity {
                let idx = (writeIndex + i) % capacity
                result[i] = buffer[idx]
            }
        }
        return result
    }

    /// Resets the buffer to all zeroes.
    public mutating func clear() {
        buffer = [Float](repeating: 0.0, count: capacity)
        writeIndex = 0
        count = 0
    }
}
