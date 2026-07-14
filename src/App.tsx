import {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "./api";
import type {
  Filter,
  LinkResult,
  PreflightItem,
  SourceEntry,
  SourceScan,
  SourceSummary,
  TargetSummary,
} from "./types";

const formatTime = () =>
  new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : typeof error === "string" ? error : "操作失败，请重试";

function Modal({
  children,
  className = "",
  onClose,
  labelledBy,
}: {
  children: ReactNode;
  className?: string;
  onClose: () => void;
  labelledBy: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={`dialog dialog--react ${className}`}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}

function SkeletonRows() {
  return (
    <div className="skeleton-list" aria-label="正在读取目录">
      {Array.from({ length: 8 }, (_, index) => (
        <div className="skeleton-row" aria-hidden="true" key={index}>
          <span className="skeleton-block" />
          <span className="skeleton-block" style={{ width: `${52 + (index % 4) * 9}%` }} />
          <span className="skeleton-block" />
          <span className="skeleton-block" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty-state">
      <div className="empty-symbol" aria-hidden="true" />
      <h2>{title}</h2>
      <p>{body}</p>
      {actionLabel && onAction ? (
        <button className="button button--secondary" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export default function App() {
  const [sources, setSources] = useState<SourceSummary[]>([]);
  const [currentSourceId, setCurrentSourceId] = useState<string | null>(null);
  const [scan, setScan] = useState<SourceScan | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [loadingSources, setLoadingSources] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [sourcePath, setSourcePath] = useState("");
  const [savingSource, setSavingSource] = useState(false);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [sourceNameDraft, setSourceNameDraft] = useState("");
  const [savingSourceName, setSavingSourceName] = useState(false);
  const [targets, setTargets] = useState<TargetSummary[]>([]);
  const [distributionOpen, setDistributionOpen] = useState(false);
  const [targetPath, setTargetPath] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<PreflightItem[]>([]);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [creatingLinks, setCreatingLinks] = useState(false);
  const [results, setResults] = useState<LinkResult[] | null>(null);
  const [browseTargetOpen, setBrowseTargetOpen] = useState(false);
  const [newTargetPath, setNewTargetPath] = useState("");
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; tone: "default" | "danger" }>>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((message: string, tone: "default" | "danger" = "default") => {
    const id = Date.now() + Math.random();
    setToasts((items) => [...items, { id, message, tone }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 3600);
  }, []);

  const currentSource = useMemo(
    () => sources.find((source) => source.id === currentSourceId) ?? null,
    [currentSourceId, sources],
  );

  const performScan = useCallback(
    async (source: SourceSummary, announce = false) => {
      setRefreshing(true);
      try {
        const nextScan = await api.scanSource(source.path);
        setScan(nextScan);
        setLastScan(formatTime());
        setFocusedId((current) => {
          if (current && nextScan.entries.some((entry) => entry.id === current)) return current;
          return (
            nextScan.entries.find((entry) => entry.name === "grill-with-docs")?.id ??
            nextScan.entries.find((entry) => entry.kind === "directory")?.id ??
            nextScan.entries[0]?.id ??
            null
          );
        });
        if (announce) showToast(`刷新完成 · 找到 ${nextScan.entries.length} 个一级内容`);
      } catch (error) {
        setScan(null);
        showToast(errorText(error), "danger");
      } finally {
        setRefreshing(false);
      }
    },
    [showToast],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.listSources(), api.listTargets()])
      .then(([sourceItems, targetItems]) => {
        if (cancelled) return;
        setSources(sourceItems);
        setTargets(targetItems);
        setCurrentSourceId((current) =>
          current && sourceItems.some((source) => source.id === current) ? current : sourceItems[0]?.id ?? null,
        );
      })
      .catch((error) => showToast(errorText(error), "danger"))
      .finally(() => {
        if (!cancelled) setLoadingSources(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  useEffect(() => {
    if (!currentSource) {
      setScan(null);
      return;
    }
    setScan(null);
    setSelected(new Set());
    setQuery("");
    setFilter("all");
    setDetailOpen(false);
    void performScan(currentSource);
  }, [currentSource?.id, performScan]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase("zh-CN") === "f") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      if (event.key === "Escape" && !distributionOpen && !addSourceOpen) setDetailOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [addSourceOpen, distributionOpen]);

  const visibleEntries = useMemo(() => {
    const loweredQuery = query.trim().toLocaleLowerCase("zh-CN");
    return (scan?.entries ?? [])
      .filter((entry) => {
        const queryMatches = !loweredQuery || entry.name.toLocaleLowerCase("zh-CN").includes(loweredQuery);
        const connected = entry.kind === "directory" && entry.connections.length > 0;
        const filterMatches =
          filter === "all" ||
          (filter === "connected" && connected) ||
          (filter === "unconnected" && (entry.kind === "file" || !connected));
        return queryMatches && filterMatches;
      })
      .sort((left, right) => left.name.localeCompare(right.name, "zh-CN", { numeric: true, sensitivity: "base" }));
  }, [filter, query, scan]);

  const selectableEntries = visibleEntries.filter((entry) => entry.kind === "directory");
  const allSelected = selectableEntries.length > 0 && selectableEntries.every((entry) => selected.has(entry.id));
  const someSelected = selectableEntries.some((entry) => selected.has(entry.id));
  const focusedEntry = scan?.entries.find((entry) => entry.id === focusedId) ?? null;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected && !allSelected;
  }, [allSelected, someSelected]);

  useEffect(() => {
    if (!distributionOpen || !targetPath || results) {
      setPreflight([]);
      return;
    }
    let cancelled = false;
    setPreflightLoading(true);
    api
      .preflightLinks([...selected].map((id) => scan?.entries.find((entry) => entry.id === id)?.path).filter(Boolean) as string[], targetPath)
      .then((items) => {
        if (!cancelled) setPreflight(items);
      })
      .catch((error) => showToast(errorText(error), "danger"))
      .finally(() => {
        if (!cancelled) setPreflightLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [distributionOpen, results, scan, selected, showToast, targetPath]);

  const toggleSelection = (entry: SourceEntry, checked: boolean) => {
    if (entry.kind !== "directory") return;
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(entry.id);
      else next.delete(entry.id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((current) => {
      const next = new Set(current);
      for (const entry of selectableEntries) {
        if (allSelected) next.delete(entry.id);
        else next.add(entry.id);
      }
      return next;
    });
  };

  const selectEntry = (entry: SourceEntry) => {
    setFocusedId(entry.id);
    setDetailOpen(true);
  };

  const onRowKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>, entry: SourceEntry) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if ((event.target as HTMLElement).matches('input[type="checkbox"]')) return;
    event.preventDefault();
    selectEntry(entry);
  };

  const addSource = async (event: FormEvent) => {
    event.preventDefault();
    if (!sourcePath.trim()) return;
    setSavingSource(true);
    try {
      const source = await api.addSource(sourcePath.trim());
      const sourceItems = await api.listSources();
      setSources(sourceItems);
      setCurrentSourceId(source.id);
      setAddSourceOpen(false);
      setSourcePath("");
      showToast(`已添加源目录“${source.name}”`);
    } catch (error) {
      showToast(errorText(error), "danger");
    } finally {
      setSavingSource(false);
    }
  };

  const browseSource = async () => {
    const path = await api.chooseDirectory("选择源目录");
    if (path) setSourcePath(path);
  };

  const removeSource = async (source: SourceSummary) => {
    try {
      await api.removeSource(source.path);
      const nextSources = sources.filter((item) => item.id !== source.id);
      setSources(nextSources);
      if (currentSourceId === source.id) setCurrentSourceId(nextSources[0]?.id ?? null);
      showToast(`已从列表移除“${source.name}”；磁盘内容保持不变`);
    } catch (error) {
      showToast(errorText(error), "danger");
    }
  };

  const beginRenameSource = (source: SourceSummary) => {
    setCurrentSourceId(source.id);
    setEditingSourceId(source.id);
    setSourceNameDraft(source.name);
  };

  const cancelRenameSource = () => {
    if (savingSourceName) return;
    setEditingSourceId(null);
    setSourceNameDraft("");
  };

  const renameSource = async (event: FormEvent, source: SourceSummary) => {
    event.preventDefault();
    const nextName = sourceNameDraft.trim();
    if (!nextName) {
      showToast("源目录名称不能为空", "danger");
      return;
    }
    if (nextName === source.name) {
      cancelRenameSource();
      return;
    }
    setSavingSourceName(true);
    try {
      const renamed = await api.renameSource(source.path, nextName);
      setSources((items) => items.map((item) => item.id === source.id ? renamed : item));
      setEditingSourceId(null);
      setSourceNameDraft("");
      showToast(`已将源目录显示名称改为“${renamed.name}”；磁盘路径保持不变`);
    } catch (error) {
      showToast(errorText(error), "danger");
    } finally {
      setSavingSourceName(false);
    }
  };

  const removeConnection = async (linkPath: string) => {
    if (!currentSource) return;
    try {
      await api.removeLink(linkPath);
      await performScan(currentSource);
      showToast("已移除软链接 · 源目录保持不变");
    } catch (error) {
      showToast(errorText(error), "danger");
    }
  };

  const openDirectory = async (path: string) => {
    try {
      await api.openDirectory(path);
    } catch (error) {
      showToast(errorText(error), "danger");
    }
  };

  const openDistribution = () => {
    setTargetPath(null);
    setPreflight([]);
    setResults(null);
    setBrowseTargetOpen(false);
    setNewTargetPath("");
    setDistributionOpen(true);
  };

  const closeDistribution = () => {
    if (creatingLinks) return;
    setDistributionOpen(false);
    setResults(null);
  };

  const browseTarget = async () => {
    const path = await api.chooseDirectory("选择目标目录");
    if (path) {
      await registerTarget(path);
      return;
    }
    if (!api.isDesktop()) setBrowseTargetOpen(true);
  };

  const registerTarget = async (path: string) => {
    if (!path.trim()) return;
    try {
      const target = await api.addTarget(path.trim());
      const targetItems = await api.listTargets();
      setTargets(targetItems);
      setTargetPath(target.path);
      setBrowseTargetOpen(false);
      setNewTargetPath("");
    } catch (error) {
      showToast(errorText(error), "danger");
    }
  };

  const forgetTarget = async (path: string) => {
    try {
      await api.forgetTarget(path);
      setTargets((items) => items.filter((item) => item.path !== path));
      if (targetPath === path) setTargetPath(null);
      showToast("已忘记目标路径；目录和现有软链接保持不变");
    } catch (error) {
      showToast(errorText(error), "danger");
    }
  };

  const createLinks = async () => {
    if (!targetPath || !scan) return;
    const sourcePaths = [...selected]
      .map((id) => scan.entries.find((entry) => entry.id === id)?.path)
      .filter(Boolean) as string[];
    setCreatingLinks(true);
    try {
      setResults(await api.createLinks(sourcePaths, targetPath));
      setTargets(await api.listTargets());
    } catch (error) {
      showToast(errorText(error), "danger");
    } finally {
      setCreatingLinks(false);
    }
  };

  const finishDistribution = async () => {
    const successCount = results?.filter((item) => item.status === "success").length ?? 0;
    setDistributionOpen(false);
    setResults(null);
    setSelected(new Set());
    if (currentSource) await performScan(currentSource);
    showToast(`分发完成 · 新建 ${successCount} 个软链接`);
  };

  return (
    <div className="app-shell">
      <header className="titlebar">
        <div className="product-mark" aria-hidden="true">S</div>
        <span className="product-name">Skills 软链接工具</span>
        <span className="titlebar-note">本地磁盘 · 手动刷新</span>
      </header>

      <div className="workspace">
        <aside className="sources-panel" aria-label="源目录">
          <div className="panel-heading sources-heading">
            <div>
              <p className="panel-title">源目录</p>
              <p className="panel-caption">{loadingSources ? "正在读取…" : `${sources.length} 个源目录`}</p>
            </div>
            <button className="icon-text-button" type="button" onClick={() => setAddSourceOpen(true)} aria-label="添加源目录">
              <span aria-hidden="true">＋</span><span>添加</span>
            </button>
          </div>
          <nav className="source-list" aria-label="已登记源目录">
            {sources.map((source) => (
              <div className={`source-item${source.id === currentSourceId ? " is-active" : ""}`} key={source.id}>
                {editingSourceId === source.id ? (
                  <form className="source-rename-form" onSubmit={(event) => void renameSource(event, source)}>
                    <span className="source-glyph" aria-hidden="true">{sourceNameDraft.charAt(0).toUpperCase() || source.name.charAt(0).toUpperCase()}</span>
                    <label className="source-rename-field">
                      <span className="visually-hidden">源目录显示名称</span>
                      <input
                        autoFocus
                        maxLength={80}
                        value={sourceNameDraft}
                        disabled={savingSourceName}
                        onChange={(event) => setSourceNameDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            cancelRenameSource();
                          }
                        }}
                      />
                    </label>
                    <div className="source-rename-actions">
                      <button className="source-action source-action--save" type="submit" disabled={savingSourceName} aria-label="保存名称" title="保存名称">✓</button>
                      <button className="source-action" type="button" disabled={savingSourceName} aria-label="取消重命名" title="取消" onClick={cancelRenameSource}>×</button>
                    </div>
                  </form>
                ) : (
                  <>
                    <button
                      className="source-item-main"
                      type="button"
                      title={source.path}
                      aria-current={source.id === currentSourceId ? "page" : undefined}
                      onClick={() => setCurrentSourceId(source.id)}
                    >
                      <span className="source-glyph" aria-hidden="true">{source.name.charAt(0).toUpperCase()}</span>
                      <span className="source-copy">
                        <span className="source-name">{source.name}</span>
                        <span className="source-path">{source.path}</span>
                      </span>
                    </button>
                    <span className="source-item-actions">
                      <button className="source-action source-rename" type="button" aria-label={`修改 ${source.name} 的显示名称`} title="修改显示名称" onClick={() => beginRenameSource(source)}>✎</button>
                      <button className="source-action source-remove" type="button" aria-label={`从列表移除 ${source.name}`} title="从列表移除" onClick={() => void removeSource(source)}>×</button>
                    </span>
                  </>
                )}
              </div>
            ))}
          </nav>
          <div className="source-footnote">
            <span className="status-dot status-dot--neutral" aria-hidden="true" />
            <p>移出列表只会忘记路径，不会删除目录或软链接。</p>
          </div>
        </aside>

        <main className="content-panel">
          <header className="content-header">
            <div className="current-source-heading">
              <div className="heading-line"><h1>{currentSource?.name ?? "源目录"}</h1></div>
              <p className="path-text path-text--header" title={currentSource?.path}>{currentSource?.path ?? "添加一个本机目录开始管理"}</p>
            </div>
            <div className="header-actions">
              <span className="scan-meta">{scan ? `${scan.entries.length} 个一级内容${lastScan ? ` · 上次扫描 ${lastScan}` : ""}` : ""}</span>
              <button className="button button--secondary" type="button" disabled={!currentSource || refreshing} onClick={() => currentSource && void performScan(currentSource, true)}>
                <span className={`refresh-symbol${refreshing ? " is-spinning" : ""}`} aria-hidden="true">↻</span>
                <span>{refreshing ? "正在刷新" : "刷新"}</span>
              </button>
            </div>
          </header>

          <section className="directory-workspace" aria-labelledby="directoryListTitle">
            <div className="command-row">
              <label className="search-field">
                <span className="visually-hidden">搜索一级文件或目录</span>
                <input ref={searchRef} type="search" placeholder="搜索文件或目录名称" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} disabled={!currentSource} />
                <kbd>Ctrl F</kbd>
              </label>
              <div className="segmented-control" aria-label="连接状态筛选">
                {(["all", "unconnected", "connected"] as Filter[]).map((value) => (
                  <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>
                    {{ all: "全部", unconnected: "未连接", connected: "已连接" }[value]}
                  </button>
                ))}
              </div>
            </div>

            <div className="table-region">
              <div className="directory-table-header" role="row">
                <div className="checkbox-cell"><input ref={selectAllRef} type="checkbox" aria-label="全选当前结果" checked={allSelected} disabled={!selectableEntries.length} onChange={toggleAll} /></div>
                <div className="header-cell" id="directoryListTitle">一级内容</div>
                <div className="header-cell header-cell--connections">连接</div>
                <div className="header-cell header-cell--status">状态</div>
              </div>
              <div className="directory-list" role="table" aria-label="一级文件和目录列表">
                {refreshing && !scan ? <SkeletonRows /> : null}
                {!refreshing && !currentSource ? <EmptyState title="还没有源目录" body="添加一个包含 Skills 的本机目录；应用只读取其一级内容。" actionLabel="添加源目录" onAction={() => setAddSourceOpen(true)} /> : null}
                {!refreshing && currentSource && scan && scan.entries.length === 0 ? <EmptyState title="目录是空的" body="这个源目录中还没有一级文件或目录。" actionLabel="重新扫描" onAction={() => void performScan(currentSource, true)} /> : null}
                {!refreshing && scan && scan.entries.length > 0 && visibleEntries.length === 0 ? <EmptyState title="没有匹配结果" body="调整搜索词或连接状态筛选后再试。" actionLabel="清除筛选" onAction={() => { setQuery(""); setFilter("all"); }} /> : null}
                {visibleEntries.map((entry) => {
                  const connected = entry.kind === "directory" && entry.connections.length > 0;
                  const isSelected = selected.has(entry.id);
                  const isCurrent = focusedId === entry.id;
                  return (
                    <div
                      className={`directory-row${entry.kind === "file" ? " is-file" : ""}${isSelected ? " is-selected" : ""}`}
                      role="row"
                      tabIndex={0}
                      aria-selected={isCurrent}
                      key={entry.id}
                      onClick={(event) => {
                        event.currentTarget.focus();
                        selectEntry(entry);
                      }}
                      onKeyDown={(event) => onRowKeyDown(event, entry)}
                    >
                      <div className="checkbox-cell" role="cell">
                        <input
                          type="checkbox"
                          aria-label={entry.kind === "file" ? `文件不支持创建软链接：${entry.name}` : `选择 ${entry.name}`}
                          disabled={entry.kind === "file"}
                          checked={isSelected}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => toggleSelection(entry, event.target.checked)}
                        />
                      </div>
                      <div className="directory-name-cell" role="cell" title={entry.name}>
                        <span className={entry.kind === "file" ? "file-glyph" : "folder-glyph"} aria-hidden="true" />
                        <span className="directory-name">{entry.name}</span>
                      </div>
                      <span className={`connection-count${connected ? " has-connections" : ""}`} role="cell">{entry.kind === "file" ? "—" : entry.connections.length}</span>
                      <span className="row-status" role="cell"><span className={`status-dot ${connected ? "status-dot--connected" : "status-dot--neutral"}`} aria-hidden="true" />{entry.kind === "file" ? "文件" : connected ? "已连接" : "未连接"}</span>
                    </div>
                  );
                })}
              </div>
              {selected.size > 0 ? (
                <div className="selection-bar">
                  <div className="selection-summary"><span className="selection-count">已选择 {selected.size} 项</span><button className="button-link" type="button" onClick={() => setSelected(new Set())}>清除选择</button></div>
                  <button className="button button--primary" type="button" onClick={openDistribution}>软链接到...</button>
                </div>
              ) : null}
            </div>
          </section>
        </main>

        <aside className={`detail-panel${detailOpen ? " is-open" : ""}`} aria-label="连接详情">
          {!focusedEntry || !currentSource ? (
            <EmptyState title="选择一个源条目" body="查看源子目录已有的软链接关系。" />
          ) : (
            <div className="detail-scroll">
              <div className="detail-header">
                <div className="detail-title-line">
                  <div className="current-source-heading"><p className="detail-kicker">连接详情</p><h2>{focusedEntry.name}</h2></div>
                  <span className="count-badge">{focusedEntry.kind === "file" ? "文件" : `${focusedEntry.connections.length} 个目录`}</span>
                  <button className="icon-button detail-close" type="button" aria-label="关闭连接详情" onClick={() => setDetailOpen(false)}>×</button>
                </div>
                <p className="detail-source-path" title={focusedEntry.path}>{focusedEntry.path}</p>
              </div>
              {focusedEntry.kind === "file" ? <EmptyState title="一级文件仅展示" body="软链接分发只支持源子目录，不会处理文件。" /> : focusedEntry.connections.length === 0 ? <EmptyState title="尚未连接" body="选择这个源子目录，然后使用“软链接到...”创建第一个连接。" /> : (
                <>
                  <div className="connection-list-heading"><h3>软链接所在目录</h3></div>
                  <div className="connection-list">
                    {focusedEntry.connections.map((connection) => (
                      <div className="connection-item" key={connection.id}>
                        <div
                          className="connection-copy"
                          role="button"
                          tabIndex={connection.available ? 0 : -1}
                          aria-disabled={!connection.available}
                          aria-label={`打开目标目录 ${connection.path}`}
                          title={connection.available ? "双击在文件资源管理器中打开" : "目标目录不可用"}
                          onDoubleClick={() => {
                            if (connection.available) void openDirectory(connection.path);
                          }}
                          onKeyDown={(event) => {
                            if (connection.available && event.key === "Enter") {
                              event.preventDefault();
                              void openDirectory(connection.path);
                            }
                          }}
                        >
                          <span className="connection-path">{connection.path}</span>
                          <span className="connection-meta"><span className={`status-dot ${connection.available ? "status-dot--connected" : "status-dot--neutral"}`} aria-hidden="true" />{connection.available ? "可访问" : "目标不可用"}</span>
                        </div>
                        <button className="remove-link-button" type="button" aria-label={`移除位于 ${connection.path} 的软链接`} onClick={() => void removeConnection(connection.linkPath)}>移除软链接</button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </aside>
      </div>

      {addSourceOpen ? (
        <Modal labelledBy="addSourceTitle" onClose={() => setAddSourceOpen(false)}>
          <form onSubmit={addSource}>
            <div className="dialog-header">
              <div><h2 id="addSourceTitle">添加源目录</h2><p>应用会读取目录的一级内容，并记住这个路径。</p></div>
              <button className="icon-button" type="button" aria-label="关闭添加源目录" onClick={() => setAddSourceOpen(false)}>×</button>
            </div>
            <div className="dialog-body">
              <label className="field-label" htmlFor="sourcePathInput">目录路径</label>
              <div className="path-picker-row">
                <input className="text-field" id="sourcePathInput" value={sourcePath} onChange={(event) => setSourcePath(event.target.value)} placeholder="C:\\Users\\name\\skills" autoFocus required />
                <button className="button button--secondary" type="button" onClick={() => void browseSource()}>浏览...</button>
              </div>
              <p className="field-help">只登记路径；不会移动或删除目录中的内容。</p>
            </div>
            <div className="dialog-actions">
              <button className="button button--secondary" type="button" onClick={() => setAddSourceOpen(false)}>取消</button>
              <button className="button button--primary" type="submit" disabled={savingSource || !sourcePath.trim()}>{savingSource ? "正在添加…" : "添加源目录"}</button>
            </div>
          </form>
        </Modal>
      ) : null}

      {distributionOpen ? (
        <Modal className="dialog--distribution" labelledBy="distributionTitle" onClose={closeDistribution}>
          {results ? (
            <DistributionResults results={results} onFinish={() => void finishDistribution()} />
          ) : (
            <>
              <div className="dialog-header">
                <div><h2 id="distributionTitle">选择目标目录</h2><p>本次将 {selected.size} 个源子目录分发到同一个位置。</p></div>
                <button className="icon-button" type="button" aria-label="关闭目标目录选择" onClick={closeDistribution}>×</button>
              </div>
              <div className="dialog-body">
                <div className="target-section-title"><span>最近使用</span><span>用于发现现有软链接</span></div>
                <div className="target-list">
                  {targets.length === 0 ? <div className="empty-state compact-empty"><p>还没有最近使用的目标目录。</p></div> : targets.map((target) => (
                    <div className={`target-row${target.path === targetPath ? " is-selected" : ""}${!target.available ? " is-unavailable" : ""}`} key={target.id}>
                      <label className="target-radio"><input type="radio" name="targetDirectory" value={target.path} checked={target.path === targetPath} disabled={!target.available} onChange={() => setTargetPath(target.path)} aria-label={`选择 ${target.name}`} /></label>
                      <label className="target-copy">
                        <span className="target-name">{target.name}{!target.available ? " · 不可用" : ""}</span>
                        <span className="target-path" title={target.path}>{target.path}</span>
                      </label>
                      <button className="forget-target-button" type="button" onClick={() => void forgetTarget(target.path)}>忘记</button>
                    </div>
                  ))}
                </div>
                {browseTargetOpen ? (
                  <div className="browse-target-row"><input className="text-field" value={newTargetPath} onChange={(event) => setNewTargetPath(event.target.value)} placeholder="D:\\Projects\\app\\.agents\\skills" autoFocus /><button className="button button--secondary" type="button" onClick={() => void registerTarget(newTargetPath)}>加入并选择</button></div>
                ) : <button className="icon-text-button" type="button" onClick={() => void browseTarget()}><span aria-hidden="true">＋</span><span>浏览新目录</span></button>}
                {targetPath ? <PreflightPanel items={preflight} loading={preflightLoading} /> : null}
              </div>
              <div className="dialog-actions">
                <button className="button button--secondary" type="button" disabled={creatingLinks} onClick={closeDistribution}>取消</button>
                <button className="button button--primary" type="button" disabled={!targetPath || preflightLoading || creatingLinks || preflight.length === 0} onClick={() => void createLinks()}>{creatingLinks ? "正在创建…" : "创建软链接"}</button>
              </div>
            </>
          )}
        </Modal>
      ) : null}

      <div className="toast-region" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => <div className={`toast${toast.tone === "danger" ? " toast--danger" : ""}`} key={toast.id}>{toast.message}</div>)}
      </div>
    </div>
  );
}

function PreflightPanel({ items, loading }: { items: PreflightItem[]; loading: boolean }) {
  const counts = {
    create: items.filter((item) => item.status === "create").length,
    connected: items.filter((item) => item.status === "connected").length,
    conflict: items.filter((item) => item.status === "conflict").length,
  };
  const labels = { create: "将创建", connected: "已连接", conflict: "名称冲突" };
  return (
    <section className="preflight" aria-labelledby="preflightTitle">
      <div className="target-section-title"><span id="preflightTitle">预检结果</span><span>冲突项会跳过，其他项目继续</span></div>
      {loading ? <div className="inline-loading">正在检查目标目录…</div> : (
        <>
          <div className="preflight-summary"><span className="summary-stat"><strong>{counts.create}</strong> 将创建</span><span className="summary-stat"><strong>{counts.connected}</strong> 已连接</span><span className="summary-stat"><strong>{counts.conflict}</strong> 名称冲突</span></div>
          <div className="preflight-list">{items.map((item) => <div className="preflight-row" key={item.sourcePath}><span title={item.reason ?? undefined}>{item.name}</span><span className={`status-label status-label--${item.status}`}>{labels[item.status]}</span></div>)}</div>
        </>
      )}
    </section>
  );
}

function DistributionResults({ results, onFinish }: { results: LinkResult[]; onFinish: () => void }) {
  const successCount = results.filter((item) => item.status === "success").length;
  const skippedCount = results.filter((item) => item.status === "connected" || item.status === "conflict").length;
  const failedCount = results.filter((item) => item.status === "failed").length;
  const labels = { success: "创建成功", connected: "已连接", conflict: "名称冲突", failed: "创建失败", create: "待创建" };
  return (
    <>
      <div className="dialog-header"><div><h2 id="distributionTitle">分发完成</h2><p>成功项已保留；跳过和失败项没有改变磁盘状态。</p></div><button className="icon-button" type="button" aria-label="关闭分发结果" onClick={onFinish}>×</button></div>
      <div className="dialog-body">
        <div className="result-summary"><div className="result-summary-item"><strong>{successCount}</strong><span>创建成功</span></div><div className="result-summary-item"><strong>{skippedCount}</strong><span>已跳过</span></div><div className="result-summary-item"><strong>{failedCount}</strong><span>创建失败</span></div></div>
        <div className="result-list">{results.map((item) => <div className="result-row" key={item.sourcePath}><span title={item.reason ?? undefined}>{item.name}{item.reason ? ` · ${item.reason}` : ""}</span><span className={`status-label status-label--${item.status}`}>{labels[item.status]}</span></div>)}</div>
      </div>
      <div className="dialog-actions"><button className="button button--primary" type="button" onClick={onFinish}>完成</button></div>
    </>
  );
}
