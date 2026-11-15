import SwiftUI

@main
struct AirAgentsApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}

/// Four tabs. With me opens first: anything waiting on you is pinned at its top.
struct RootView: View {
    enum Screen: Hashable { case withMe, places, activity, agents }

    @State private var screen: Screen = .withMe

    var body: some View {
        TabView(selection: $screen) {
            Tab("With me", systemImage: "eye", value: .withMe) { WithMeView() }
            Tab("Places", systemImage: "map", value: .places) { PlacesView() }
            Tab("Activity", systemImage: "list.bullet", value: .activity) { ActivityView() }
            Tab("Agents", systemImage: "square.grid.2x2", value: .agents) { AgentsView() }
        }
        .fontWeight(.regular)
    }
}
