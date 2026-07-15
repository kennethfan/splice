interface Tab {
  filePath: string;
}

interface Props {
  tabs: Tab[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onClose: (index: number) => void;
  onNewTab: () => void;
}

function fileName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

export function TabBar({ tabs, activeIndex, onSelect, onClose, onNewTab }: Props) {
  return (
    <div className="tab-bar">
      <div className="tab-list">
        {tabs.map((tab, i) => (
          <div
            key={tab.filePath}
            className={`tab ${i === activeIndex ? "tab--active" : ""}`}
            onClick={() => onSelect(i)}
          >
            <span className="tab-icon">
              {i === activeIndex ? "●" : "○"}
            </span>
            <span className="tab-name">{fileName(tab.filePath)}</span>
            <button
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                onClose(i);
              }}
              title="Close tab"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button className="tab-new" onClick={onNewTab} title="Open file (Cmd+O)">
        +
      </button>
    </div>
  );
}
