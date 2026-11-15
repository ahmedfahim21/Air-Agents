/// The head gestures the app understands. Each has exactly one meaning, in every context.
public enum Gesture: String, CaseIterable, Sendable {
    /// Turn toward an agent.
    case turn
    case doubleNod
    case doubleShake
    /// Look away from the agent you're talking to and hold for about two seconds.
    case lookAway
    /// Tilt your head toward a shoulder.
    case tilt

    public var meaning: GestureMeaning {
        switch self {
        case .turn: .pick
        case .doubleNod: .yes
        case .doubleShake: .no
        case .lookAway: .endConversation
        case .tilt: .sayAgain
        }
    }
}

public enum GestureMeaning: String, CaseIterable, Sendable {
    /// Select the agent you're facing.
    case pick
    /// Approve the request just spoken; with nothing pending, wake the agent you're facing.
    case yes
    /// Refuse the request just spoken. A shake never ends a conversation.
    case no
    case endConversation
    /// Hear the last thing again.
    case sayAgain
}
