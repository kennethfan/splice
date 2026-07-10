import "./styles/splice.css";

function App() {
  return (
    <div className="splice-layout">
      {/* Title Bar */}
      <div className="title-bar">
        <span className="title-bar-icon">⛓️</span>
        <span className="title-bar-text">Splice</span>
        <span className="title-bar-file">— Ready</span>
        <div className="title-bar-spacer" />
        <span className="title-bar-status">● idle</span>
      </div>

      {/* Three-Pane Area */}
      <div className="panes">
        <div className="pane">
          <div className="pane-header">Local (Yours)</div>
          <div className="pane-content pane-placeholder">
            <div className="placeholder-icon">📂</div>
            <div className="placeholder-text">
              Drop a conflicted file here<br />
              or run <code>git mergetool</code>
            </div>
          </div>
        </div>
        <div className="pane pane-result">
          <div className="pane-header">Result</div>
          <div className="pane-content pane-placeholder">
            <div className="placeholder-icon">⛓️</div>
            <div className="placeholder-text">Splice</div>
            <div className="placeholder-sub">Git Conflict Resolver</div>
            <div className="placeholder-hint">
              <code>Cmd + O</code> to open a file
            </div>
          </div>
        </div>
        <div className="pane">
          <div className="pane-header">Remote (Theirs)</div>
          <div className="pane-content pane-placeholder">
            <div className="placeholder-icon">📂</div>
            <div className="placeholder-text">
              Waiting for conflicts<br />
              to resolve...
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="bottom-bar">
        <div className="bottom-left">
          <span className="conflict-count">Conflicts: —</span>
        </div>
        <div className="bottom-center">
          <button className="btn btn-nav disabled" disabled>←</button>
          <span className="nav-text">No file loaded</span>
          <button className="btn btn-nav disabled" disabled>→</button>
        </div>
        <div className="bottom-right">
          <span className="version">v0.1.0</span>
        </div>
      </div>
    </div>
  );
}

export default App;
