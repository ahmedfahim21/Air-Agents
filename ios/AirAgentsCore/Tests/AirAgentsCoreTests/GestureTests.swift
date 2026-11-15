import Testing
@testable import AirAgentsCore

@Suite struct GestureTests {
    @Test func everyGestureHasItsOwnMeaning() {
        let meanings = Gesture.allCases.map(\.meaning)
        #expect(Set(meanings).count == Gesture.allCases.count)
    }

    @Test func everyMeaningHasAGesture() {
        #expect(Set(Gesture.allCases.map(\.meaning)) == Set(GestureMeaning.allCases))
    }

    @Test func meaningsAreTheAgreedOnes() {
        #expect(Gesture.turn.meaning == .pick)
        #expect(Gesture.doubleNod.meaning == .yes)
        #expect(Gesture.doubleShake.meaning == .no)
        #expect(Gesture.lookAway.meaning == .endConversation)
        #expect(Gesture.tilt.meaning == .sayAgain)
    }
}
