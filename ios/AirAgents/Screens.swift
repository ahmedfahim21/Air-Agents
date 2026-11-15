import SwiftUI

// Placeholder screens for the four tabs. Each shows its specified empty state: one sentence,
// and one action only where an action can work today. No dead controls.

struct WithMeView: View {
    var body: some View {
        NavigationStack {
            EmptyStateView(
                systemImage: "person.wave.2",
                text: "Your agents will sit around you here."
            )
            .navigationTitle("With me")
        }
    }
}

struct PlacesView: View {
    var body: some View {
        NavigationStack {
            EmptyStateView(systemImage: "mappin.and.ellipse", text: "Pin an agent to a place you go.")
                .navigationTitle("Places")
        }
    }
}

struct ActivityView: View {
    var body: some View {
        NavigationStack {
            EmptyStateView(
                systemImage: "list.bullet",
                text: "Nothing yet. Your agents' actions will appear here."
            )
            .navigationTitle("Activity")
        }
    }
}

struct AgentsView: View {
    var body: some View {
        NavigationStack {
            EmptyStateView(systemImage: "square.grid.2x2", text: "Pick an agent to get started.")
                .navigationTitle("Agents")
        }
    }
}

/// One sentence in secondary ink under an SF Symbol. Regular weight only.
struct EmptyStateView: View {
    let systemImage: String
    let text: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.largeTitle)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text(text)
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemGroupedBackground))
    }
}
