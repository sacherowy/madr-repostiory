// Szkielet GUI. Docelowe features (osobne katalogi w src/features/):
//   adr-editor · folder-tree · relations-graph · history-timeline · diff-viewer · similarity-panel · search
export function App() {
  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: 720, margin: "0 auto" }}>
      <h1>ADR Manager</h1>
      <p>Nakładka na git do zarządzania Architecture Decision Records.</p>
      <p>Źródłem prawdy jest repozytorium git; SQLite to tylko projekcja do wyszukiwania.</p>
    </main>
  );
}
