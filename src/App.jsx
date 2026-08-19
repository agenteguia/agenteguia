import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.js";

const nav = [
  ["Empresas", "▦"],
  ["Locais", "⌖"],
  ["Categorias", "◇"],
];
const emptyData = { categorias: [], empresas: [], locais: [], fotos: [] };

function Field({ label, children, full = false }) {
  return (
    <label className={full ? "field full" : "field"}>
      <span>{label}</span>
      {children}
    </label>
  );
}
function Input(props) {
  return <input {...props} />;
}
function Stat({ value, label }) {
  return (
    <div className="stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}
function Status({ value }) {
  const labels = {
    ativo: "Ativa",
    pendente_aprovacao: "Pendente",
    inadimplente: "Inadimplente",
    recusado: "Recusada",
    inativo: "Inativo",
  };
  return <span className={`status ${value}`}>{labels[value] || value}</span>;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [data, setData] = useState(emptyData);
  const [page, setPage] = useState("Empresas");
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Todas");
  const [modal, setModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);

  const showNotice = (message, type = "success") => {
    setNotice({ message, type });
    window.setTimeout(() => setNotice(null), 4200);
  };
  const loadData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [categorias, empresas, locais, fotos] = await Promise.all([
      supabase
        .from("categorias")
        .select("*")
        .order("ordem", { ascending: true }),
      supabase
        .from("empresas")
        .select("*, categoria:categorias(nome)")
        .order("criado_em", { ascending: false }),
      supabase
        .from("locais")
        .select(
          "*, categoria:categorias(nome), empresa:empresas(nome_fantasia)",
        )
        .order("nome", { ascending: true }),
      supabase
        .from("fotos_locais")
        .select("*")
        .order("ordem", { ascending: true }),
    ]);
    const error =
      categorias.error || empresas.error || locais.error || fotos.error;
    if (error)
      showNotice(
        `Não foi possível carregar os dados: ${error.message}`,
        "error",
      );
    else
      setData({
        categorias: categorias.data || [],
        empresas: empresas.data || [],
        locais: locais.data || [],
        fotos: fotos.data || [],
      });
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => setSession(session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) =>
      setSession(nextSession),
    );
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (session) loadData();
  }, [session, loadData]);

  const rows = useMemo(() => {
    const list =
      page === "Empresas"
        ? data.empresas
        : page === "Locais"
          ? data.locais
          : data.categorias;
    const normalizedSearch = search.toLowerCase().trim();
    return list.filter((item) => {
      const categoryMatches =
        page === "Categorias" ||
        categoryFilter === "Todas" ||
        item.categoria_id === categoryFilter;
      const linkedPlace =
        page === "Empresas"
          ? data.locais.find((place) => place.empresa_id === item.id)
          : null;
      const searchable = [
        item.nome_fantasia,
        item.nome,
        item.descricao,
        item.endereco,
        item.telefone,
        item.categoria?.nome,
        linkedPlace?.nome,
        linkedPlace?.descricao,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return categoryMatches && searchable.includes(normalizedSearch);
    });
  }, [data, page, search, categoryFilter]);
  const titles = {
    Empresas: ["Empresas", "Gerencie os parceiros e negócios da plataforma."],
    Locais: ["Locais", "Organize os lugares que o Agente Guia recomenda."],
    Categorias: [
      "Categorias",
      "Defina como os locais são agrupados no aplicativo.",
    ],
  };

  async function saveRecord(values) {
    if (!supabase)
      return showNotice(
        "Configure as credenciais do Supabase no arquivo .env.",
        "error",
      );
    setLoading(true);
    let table;
    let payload;
    if (page === "Empresas") {
      table = "empresas";
      payload = {
        nome_fantasia: values.nome_fantasia,
        cnpj: values.cnpj || null,
        categoria_id: values.categoria_id,
        responsavel_nome: values.responsavel_nome,
        telefone: values.telefone,
        email: values.email,
        status: values.status,
      };
      if (!editingRecord) payload.criado_em = new Date().toISOString();
    } else if (page === "Locais") {
      table = "locais";
      payload = {
        categoria_id: values.categoria_id,
        empresa_id: values.empresa_id || null,
        nome: values.nome,
        descricao: values.descricao || null,
        historia: values.historia || null,
        endereco: values.endereco || null,
        latitude: values.latitude ? Number(values.latitude) : null,
        longitude: values.longitude ? Number(values.longitude) : null,
        faixa_preco: values.faixa_preco || null,
        telefone: values.telefone || null,
        instagram: values.instagram || null,
        horario_funcionamento: values.horario_funcionamento || null,
        foto_capa_url: values.foto_capa_url || null,
        link_google_maps: values.link_google_maps || null,
        link_google_maps_curto: values.link_google_maps_curto || null,
        ativo: values.ativo === "on",
      };
    } else {
      table = "categorias";
      payload = {
        nome: values.nome,
        icone: values.icone || null,
        ordem: Number(values.ordem) || 0,
      };
    }
    const result = editingRecord
      ? await supabase
          .from(table)
          .update(payload)
          .eq("id", editingRecord.id)
          .select("id")
          .single()
      : await supabase.from(table).insert(payload).select("id").single();
    if (result.error) {
      setLoading(false);
      return showNotice(
        `Não foi possível salvar: ${result.error.message}`,
        "error",
      );
    }
    if (page === "Locais") {
      const localId = editingRecord?.id || result.data.id;
      const coverFile = values._coverFile;
      const extraFiles = values._extraFiles || [];
      const deletedPhotoIds = values._deletedPhotoIds || [];
      const getStoragePath = (url) => {
        const marker = "/storage/v1/object/public/locais/";
        const markerIndex = url?.indexOf(marker);
        return markerIndex === -1 ? null : decodeURIComponent(url.slice(markerIndex + marker.length));
      };
      const uploadFile = async (file, folder) => {
        const extension = file.name.includes(".")
          ? `.${file.name.split(".").pop()}`
          : "";
        const path = `${localId}/${folder}-${crypto.randomUUID()}${extension}`;
        const upload = await supabase.storage
          .from("locais")
          .upload(path, file, {
            upsert: false,
            contentType: file.type || undefined,
          });
        if (upload.error) throw upload.error;
        return supabase.storage.from("locais").getPublicUrl(path).data
          .publicUrl;
      };
      try {
        if (deletedPhotoIds.length) {
          const deletedPhotos = data.fotos.filter((photo) => deletedPhotoIds.includes(photo.id));
          const paths = deletedPhotos.map((photo) => getStoragePath(photo.url)).filter(Boolean);
          if (paths.length) {
            const storageDelete = await supabase.storage.from("locais").remove(paths);
            if (storageDelete.error) throw storageDelete.error;
          }
          const photosDelete = await supabase.from("fotos_locais").delete().in("id", deletedPhotoIds);
          if (photosDelete.error) throw photosDelete.error;
        }
        if (coverFile) {
          const coverUrl = await uploadFile(coverFile, "capa");
          const coverUpdate = await supabase
            .from("locais")
            .update({ foto_capa_url: coverUrl })
            .eq("id", localId);
          if (coverUpdate.error) throw coverUpdate.error;
        }
        if (extraFiles.length) {
          const currentPhotos = data.fotos.filter(
            (photo) => photo.local_id === localId,
          );
          const uploadedPhotos = [];
          for (const [index, file] of extraFiles.entries())
            uploadedPhotos.push({
              local_id: localId,
              url: await uploadFile(file, "extra"),
              ordem: currentPhotos.length + index + 1,
            });
          const photosInsert = await supabase
            .from("fotos_locais")
            .insert(uploadedPhotos);
          if (photosInsert.error) throw photosInsert.error;
        }
      } catch (uploadError) {
        setLoading(false);
        return showNotice(
          `Local salvo, mas não foi possível enviar as fotos: ${uploadError.message}`,
          "error",
        );
      }
    }
    setLoading(false);
    setModal(false);
    setEditingRecord(null);
    showNotice(
      `${page.slice(0, -1)} ${editingRecord ? "atualizado" : "salvo"} com sucesso.`,
    );
    await loadData();
  }

  async function deleteRecord(record) {
    if (!supabase)
      return showNotice(
        "Configure as credenciais do Supabase no arquivo .env.",
        "error",
      );
    setDeleteTarget(record);
  }

  async function confirmDelete() {
    if (!supabase || !deleteTarget) return;
    setLoading(true);
    const table =
      page === "Empresas"
        ? "empresas"
        : page === "Locais"
          ? "locais"
          : "categorias";
    const result = await supabase
      .from(table)
      .delete()
      .eq("id", deleteTarget.id);
    setLoading(false);
    setDeleteTarget(null);
    if (result.error)
      return showNotice(
        `Não foi possível excluir: ${result.error.message}`,
        "error",
      );
    showNotice(`${page.slice(0, -1)} excluído com sucesso.`);
    await loadData();
  }
  if (!session)
    return <Login onError={(message) => showNotice(message, "error")} />;
  const [title, subtitle] = titles[page];
  const activeCompanies = data.empresas.filter(
    (x) => x.status === "ativo",
  ).length;
  const pendingCompanies = data.empresas.filter(
    (x) => x.status === "pendente_aprovacao",
  ).length;
  const activePlaces = data.locais.filter((x) => x.ativo).length;
  const publicPlaces = data.locais.filter((x) => !x.empresa_id).length;
  return (
    <div className="app-shell">
      <aside className={menuOpen ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="brand-mark">
            <img
              src="/logo-guia-porto.png"
              alt="Agente Guia"
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </div>
          <div>
            <strong>Agente Guia</strong>
            <small>Painel de gestão</small>
          </div>
          <button className="close" onClick={() => setMenuOpen(false)}>
            ×
          </button>
        </div>
        <nav>
          {nav.map(([name, icon]) => (
            <button
              className={page === name ? "nav-item active" : "nav-item"}
              key={name}
              onClick={() => {
                setPage(name);
                setMenuOpen(false);
                setSearch("");
                setCategoryFilter("Todas");
              }}
            >
              <i>{icon}</i>
              {name}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile">
            <div className="avatar">VG</div>
            <div>
              <b>{session.user.email?.split("@")[0] || "Administrador"}</b>
              <small>Administrador</small>
            </div>
          </div>
          <button className="logout" onClick={() => supabase.auth.signOut()}>
            ↪ Sair
          </button>
        </div>
      </aside>
      <main>
        <header>
          <button className="menu-button" onClick={() => setMenuOpen(true)}>
            ☰
          </button>
          <div className="crumb">
            Gestão <span>/</span> {page}
          </div>
          <div className="header-actions">
            <button className="help">?</button>
            <button className="avatar">VG</button>
          </div>
        </header>
        <section className="content">
          <div className="title-row">
            <div>
              <h1>{page === "Empresas" ? "Empresas parceiras" : title}</h1>
              <p>
                {page === "Empresas"
                  ? `${data.empresas.length} no total`
                  : subtitle}
              </p>
            </div>
            <button
              className="primary"
              onClick={() => {
                setEditingRecord(null);
                setModal(true);
              }}
            >
              ＋ Nova {page.slice(0, -1)}
            </button>
          </div>
          <div className="stats">
            {page === "Empresas" && (
              <>
                <Stat
                  value={data.empresas.length}
                  label="Empresas cadastradas"
                />
                <Stat value={activeCompanies} label="Empresas ativas" />
                <Stat value={pendingCompanies} label="Aguardando aprovação" />
              </>
            )}
            {page === "Locais" && (
              <>
                <Stat value={data.locais.length} label="Locais cadastrados" />
                <Stat value={activePlaces} label="Locais ativos" />
                <Stat value={publicPlaces} label="Pontos públicos" />
              </>
            )}
            {page === "Categorias" && (
              <>
                <Stat value={data.categorias.length} label="Categorias" />
                <Stat value={data.locais.length} label="Locais organizados" />
              </>
            )}
          </div>
          <section className={page === "Empresas" ? "partner-panel" : "panel"}>
            <div className="panel-top">
              <div className="search">
                <span>⌕</span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={
                    page === "Locais"
                      ? "Buscar locais..."
                      : `Buscar ${page.toLowerCase()}...`
                  }
                />
              </div>
              {page !== "Categorias" && (
                <div className="category-filters">
                  <button
                    className={
                      categoryFilter === "Todas"
                        ? "category-filter active"
                        : "category-filter"
                    }
                    onClick={() => setCategoryFilter("Todas")}
                  >
                    Todas
                  </button>
                  {data.categorias.map((category) => (
                    <button
                      className={
                        categoryFilter === category.id
                          ? "category-filter active"
                          : "category-filter"
                      }
                      key={category.id}
                      onClick={() => setCategoryFilter(category.id)}
                    >
                      {category.icone || "◇"} {category.nome}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <DataTable
              page={page}
              rows={rows}
              allPlaces={data.locais}
              allPhotos={data.fotos}
              loading={loading}
              onEdit={(record) => {
                setEditingRecord(record);
                setModal(true);
              }}
              onDelete={(record) => deleteRecord(record)}
            />
          </section>
        </section>
      </main>
      {modal && (
        <Editor
          page={page}
          categories={data.categorias}
          companies={data.empresas}
          loading={loading}
          record={editingRecord}
          photos={data.fotos.filter((photo) => photo.local_id === editingRecord?.id)}
          close={() => {
            setModal(false);
            setEditingRecord(null);
          }}
          save={saveRecord}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          item={deleteTarget}
          page={page}
          loading={loading}
          cancel={() => setDeleteTarget(null)}
          confirm={confirmDelete}
        />
      )}
      {notice && (
        <div
          className={`toast ${notice.type === "error" ? "toast-error" : ""}`}
        >
          {notice.type === "error" ? "!" : "✓"} {notice.message}
        </div>
      )}
    </div>
  );
}

function DataTable({ page, rows, allPlaces, allPhotos, loading, onEdit, onDelete }) {
  if (page === "Categorias")
    return rows.length ? (
      <div className="category-grid">
        {rows.map((x) => (
          <article className="category-card" key={x.id}>
            <div className="category-icon">{x.icone || "◇"}</div>
            <div>
              <b>{x.nome}</b>
              <p>Ordem de exibição: {x.ordem}</p>
            </div>
            <div className="row-actions">
              <button
                type="button"
                className="icon-button edit"
                onClick={() => onEdit(x)}
                title="Editar"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
              </button>
              <button
                type="button"
                className="icon-button delete"
                onClick={() => onDelete(x)}
                title="Excluir"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 6h18" />
                  <path d="M8 6V4h8v2" />
                  <path d="M6 6v14h12V6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                </svg>
              </button>
            </div>
          </article>
        ))}
      </div>
    ) : (
      <div className="empty">
        {loading
          ? "Carregando dados..."
          : "Ainda não há categorias cadastradas."}
      </div>
    );
  const company = page === "Empresas";
  if (company)
    return rows.length ? (
      <div className="partner-grid">
        {rows.map((x) => {
          const place = allPlaces?.find((item) => item.empresa_id === x.id);
          const photoCount = place
            ? allPhotos?.filter((photo) => photo.local_id === place.id).length || 0
            : 0;
          return (
            <article className="partner-card" key={x.id}>
              <div className="partner-image">
                {place?.foto_capa_url ? (
                  <img src={place.foto_capa_url} alt={x.nome_fantasia} />
                ) : (
                  <span>{x.nome_fantasia?.charAt(0) || "A"}</span>
                )}
              </div>
              <div className="partner-body">
                <h3>{x.nome_fantasia}</h3>
                <p className="partner-meta">
                  {x.categoria?.icone || "◇"}{" "}
                  {x.categoria?.nome || "Sem categoria"}
                  {place?.endereco ? ` · ${place.endereco}` : ""}
                </p>
                <p className="partner-description">
                  {place?.descricao || "Empresa parceira do Agente Guia."}
                </p>
                <div className="partner-footer">
                  <small>
                    {photoCount}{" "}
                    foto(s) extra
                  </small>
                  <button
                    type="button"
                    className="edit-button"
                    onClick={() => onEdit(x)}
                  >
                    ✎ Editar
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    ) : (
      <div className="empty">
        {loading ? "Carregando dados..." : "Nenhum resultado encontrado."}
      </div>
    );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {(company
              ? ["Empresa", "Categoria", "Responsável", "Contato", "Status", ""]
              : ["Local", "Categoria", "Vinculado a", "Endereço", "Status", ""]
            ).map((x) => (
              <th key={x}>{x}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.id}>
              <td>
                <b>{x.nome_fantasia || x.nome}</b>
                {company && <small>{x.cnpj}</small>}
              </td>
              <td>
                <span className="pill">
                  {x.categoria?.nome || "Sem categoria"}
                </span>
              </td>
              <td>
                {company
                  ? x.responsavel_nome
                  : x.empresa?.nome_fantasia || "Ponto público"}
              </td>
              <td>{company ? x.telefone : x.endereco}</td>
              <td>
                {company ? (
                  <Status value={x.status} />
                ) : (
                  <Status value={x.ativo ? "ativo" : "inativo"} />
                )}
              </td>
              <td>
                <div className="row-actions">
                  <button
                    type="button"
                    className="icon-button edit"
                    onClick={() => onEdit(x)}
                    title="Editar"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="icon-button delete"
                    onClick={() => onDelete(x)}
                    title="Excluir"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 6h18" />
                      <path d="M8 6V4h8v2" />
                      <path d="M6 6v14h12V6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <div className="empty">
          {loading ? "Carregando dados..." : "Nenhum resultado encontrado."}
        </div>
      )}
    </div>
  );
}

function DeleteConfirmModal({ item, page, loading, cancel, confirm }) {
  return (
    <div className="modal-layer">
      <div className="modal confirm-modal">
        <div className="modal-header">
          <div>
            <h2>Confirmar exclusão</h2>
            <p>
              Deseja realmente excluir este {page.slice(0, -1).toLowerCase()}?
            </p>
          </div>
          <button type="button" onClick={cancel}>
            ×
          </button>
        </div>
        <div className="confirm-content">
          <p>
            <strong>{item.nome || item.nome_fantasia || "Registro"}</strong>
          </p>
          <p className="confirm-note">Esta ação não pode ser desfeita.</p>
        </div>
        <div className="confirm-actions">
          <button
            type="button"
            className="secondary"
            onClick={cancel}
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="primary"
            onClick={confirm}
            disabled={loading}
          >
            {loading ? "Excluindo..." : "Excluir"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PhotoPicker({ label, hint, multiple = false, files, onChange }) {
  return (
    <label className="photo-action">
        <input
          type="file"
          accept="image/*"
          multiple={multiple}
          onChange={onChange}
        />
        <span className="photo-icon">▧</span>
        <span>{label}</span>
        {files.length > 0 && <small>{files.length}</small>}
        {hint && <span className="sr-only">{hint}</span>}
    </label>
  );
}

function PhotoPreview({ src, alt, cover = false, removable = false, onRemove, onOpen }) {
  return (
    <div className={`photo-preview ${cover ? "cover-preview" : ""} ${removable ? "is-removable" : ""}`}>
      <button type="button" className="photo-preview-open" onClick={onOpen} title="Ampliar foto">
        <img src={src} alt={alt} />
      </button>
      {cover && <span className="photo-cover-badge">Capa</span>}
      {removable && <button type="button" className="photo-remove" onClick={onRemove} title="Remover foto">×</button>}
    </div>
  );
}

function Editor({
  page,
  categories,
  companies,
  photos = [],
  record,
  close,
  save,
  loading,
}) {
  const isCompany = page === "Empresas",
    isPlace = page === "Locais";
  const [previewUrl, setPreviewUrl] = useState(record?.foto_capa_url || "");
  const [coverFile, setCoverFile] = useState(null);
  const [extraFiles, setExtraFiles] = useState([]);
  const [deletedPhotoIds, setDeletedPhotoIds] = useState([]);
  const [formValues, setFormValues] = useState({});
  const [expandedImage, setExpandedImage] = useState(null);

  const handleInputChange = (e) => {
    if (e.target.name === "foto_capa_url") setPreviewUrl(e.target.value);
    setFormValues({ ...formValues, [e.target.name]: e.target.value });
  };

  const extractLatLng = (mapsUrl) => {
    if (!mapsUrl) return { lat: "", lng: "" };
    const match = mapsUrl.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (match) return { lat: match[1], lng: match[2] };
    return { lat: "", lng: "" };
  };

  const submit = (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    values._coverFile = coverFile;
    values._extraFiles = extraFiles;
    values._deletedPhotoIds = deletedPhotoIds;
    save(values);
  };
  return (
    <>
      <div className="modal-layer">
        <form className="modal" onSubmit={submit}>
          <div className="modal-header">
            <div>
              <h2>
                {record ? "Editar" : "Nova"} {page.slice(0, -1)}
              </h2>
              <p>
                {record
                  ? "Atualize os dados abaixo."
                  : "Preencha os dados abaixo para cadastrar."}
              </p>
            </div>
            <button type="button" onClick={close}>
              ×
            </button>
          </div>
          <div className="form-grid">
            {isCompany && (
              <>
                <Field label="Nome fantasia">
                  <Input
                    name="nome_fantasia"
                    defaultValue={record?.nome_fantasia || ""}
                    required
                    placeholder="Ex.: Bistrô do Porto"
                  />
                </Field>
                <Field label="CNPJ (opcional)">
                  <Input
                    name="cnpj"
                    defaultValue={record?.cnpj || ""}
                    placeholder="00.000.000/0000-00"
                  />
                </Field>
                <Field label="Categoria">
                  <select
                    name="categoria_id"
                    required
                    defaultValue={record?.categoria_id || ""}
                  >
                    <option value="" disabled>
                      Selecione uma categoria
                    </option>
                    {categories.map((x) => (
                      <option value={x.id} key={x.id}>
                        {x.nome}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Status">
                  <select
                    name="status"
                    defaultValue={record?.status || "pendente_aprovacao"}
                  >
                    <option value="pendente_aprovacao">
                      Pendente de aprovação
                    </option>
                    <option value="ativo">Ativo</option>
                    <option value="inadimplente">Inadimplente</option>
                    <option value="recusado">Recusado</option>
                  </select>
                </Field>
                <Field label="Nome do responsável">
                  <Input
                    name="responsavel_nome"
                    defaultValue={record?.responsavel_nome || ""}
                    required
                    placeholder="Nome completo"
                  />
                </Field>
                <Field label="Telefone">
                  <Input
                    name="telefone"
                    defaultValue={record?.telefone || ""}
                    required
                    placeholder="(00) 00000-0000"
                  />
                </Field>
                <Field label="E-mail" full>
                  <Input
                    name="email"
                    type="email"
                    defaultValue={record?.email || ""}
                    required
                    placeholder="contato@empresa.com"
                  />
                </Field>
              </>
            )}
            {isPlace && (
              <>
                <Field label="Nome">
                  <Input
                    name="nome"
                    defaultValue={record?.nome || ""}
                    required
                    placeholder="Nome do local"
                  />
                </Field>
                <Field label="Categoria">
                  <select
                    name="categoria_id"
                    required
                    defaultValue={record?.categoria_id || ""}
                  >
                    <option value="" disabled>
                      Selecione uma categoria
                    </option>
                    {categories.map((x) => (
                      <option value={x.id} key={x.id}>
                        {x.nome}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Empresa vinculada">
                  <select
                    name="empresa_id"
                    defaultValue={record?.empresa_id || ""}
                  >
                    <option value="">Ponto público (sem empresa)</option>
                    {companies.map((x) => (
                      <option value={x.id} key={x.id}>
                        {x.nome_fantasia}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Faixa de preço">
                  <select
                    name="faixa_preco"
                    defaultValue={record?.faixa_preco || ""}
                  >
                    <option value="">Não informado</option>
                    <option value="$">$</option>
                    <option value="$$">$$</option>
                    <option value="$$$">$$$</option>
                  </select>
                </Field>
                <Field label="Descrição" full>
                  <textarea
                    name="descricao"
                    defaultValue={record?.descricao || ""}
                    placeholder="O que é este lugar?"
                  />
                </Field>
                <Field label="História e curiosidades" full>
                  <textarea
                    name="historia"
                    defaultValue={record?.historia || ""}
                    placeholder="Informações que o agente contará ao recomendar"
                  />
                </Field>
                <Field label="Endereço" full>
                  <Input
                    name="endereco"
                    defaultValue={record?.endereco || ""}
                    placeholder="Rua, número, bairro"
                  />
                </Field>
                <Field label="Telefone">
                  <Input
                    name="telefone"
                    defaultValue={record?.telefone || ""}
                    placeholder="(00) 00000-0000"
                  />
                </Field>
                <Field label="Instagram">
                  <Input
                    name="instagram"
                    defaultValue={record?.instagram || ""}
                    placeholder="@perfil"
                  />
                </Field>
                <Field label="Horário de funcionamento" full>
                  <Input
                    name="horario_funcionamento"
                    defaultValue={record?.horario_funcionamento || ""}
                    placeholder="Segunda a sábado, 9h às 18h"
                  />
                </Field>
                <Field label="Link Google Maps" full>
                  <Input
                    name="link_google_maps"
                    type="url"
                    onChange={handleInputChange}
                    defaultValue={record?.link_google_maps || ""}
                    placeholder="https://maps.google.com/?q=..."
                  />
                </Field>
                <div className="photos-section full">
                  <h3>Fotos</h3>
                  <div className="photo-pickers">
                    <PhotoPicker
                      label="Capa"
                      hint="Essa é a que o agente manda nas recomendações"
                      files={coverFile ? [coverFile] : []}
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        setCoverFile(file);
                        if (file) setPreviewUrl(URL.createObjectURL(file));
                      }}
                    />
                    <PhotoPicker
                      label="+ Fotos"
                      hint="Mostradas quando o turista pede mais detalhes"
                      multiple
                      files={extraFiles}
                      onChange={(event) =>
                        setExtraFiles(
                          Array.from(event.target.files || []).slice(0, 7),
                        )
                      }
                    />
                  </div>
                  {(previewUrl || photos.length > 0 || extraFiles.length > 0) && (
                    <div className="photo-previews">
                      {previewUrl && <PhotoPreview src={previewUrl} alt="Foto de capa" cover onOpen={() => setExpandedImage(previewUrl)} />}
                      {photos.filter((photo) => !deletedPhotoIds.includes(photo.id)).map((photo) => (
                        <PhotoPreview
                          key={photo.id}
                          src={photo.url}
                          alt={photo.legenda || "Foto do local"}
                          removable
                          onOpen={() => setExpandedImage(photo.url)}
                          onRemove={() => setDeletedPhotoIds((current) => [...current, photo.id])}
                        />
                      ))}
                      {extraFiles.map((file, index) => {
                        const fileUrl = URL.createObjectURL(file);
                        return <PhotoPreview key={`${file.name}-${index}`} src={fileUrl} alt={file.name} removable onOpen={() => setExpandedImage(fileUrl)} onRemove={() => setExtraFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} />;
                      })}
                    </div>
                  )}
                </div>
                <Field label="Link Google Maps Curto" full>
                  <Input
                    name="link_google_maps_curto"
                    type="url"
                    onChange={handleInputChange}
                    defaultValue={record?.link_google_maps_curto || ""}
                    placeholder="https://goo.gl/..."
                  />
                </Field>
                <Field label="Latitude">
                  <Input
                    name="latitude"
                    type="number"
                    step="any"
                    defaultValue={
                      record?.latitude ??
                      extractLatLng(record?.link_google_maps || "").lat
                    }
                    placeholder="-3.71722"
                  />
                </Field>
                <Field label="Longitude">
                  <Input
                    name="longitude"
                    type="number"
                    step="any"
                    defaultValue={
                      record?.longitude ??
                      extractLatLng(record?.link_google_maps || "").lng
                    }
                    placeholder="-38.54306"
                  />
                </Field>
                <Field full label="">
                  <span className="check-line">
                    <input
                      name="ativo"
                      type="checkbox"
                      defaultChecked={record?.ativo ?? true}
                    />{" "}
                    Local ativo e visível no Guia
                  </span>
                </Field>
              </>
            )}
            {!isCompany && !isPlace && (
              <>
                <Field label="Nome">
                  <Input
                    name="nome"
                    defaultValue={record?.nome || ""}
                    required
                    placeholder="Ex.: Restaurantes"
                  />
                </Field>
                <Field label="Ícone">
                  <Input
                    name="icone"
                    defaultValue={record?.icone || ""}
                    placeholder="Emoji ou nome do ícone"
                  />
                </Field>
                <Field label="Ordem de exibição">
                  <Input
                    name="ordem"
                    type="number"
                    required
                    defaultValue={record?.ordem ?? 0}
                  />
                </Field>
              </>
            )}
          </div>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={close}>
              Cancelar
            </button>
            <button className="primary" disabled={loading}>
              {loading ? "Salvando..." : `Salvar ${page.slice(0, -1)}`}
            </button>
          </div>
        </form>
      </div>
      {expandedImage && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setExpandedImage(null)}
        >
          <div
            style={{
              position: "relative",
              background: "#fff",
              padding: "20px",
              borderRadius: "12px",
              maxWidth: "90vw",
              maxHeight: "90vh",
            }}
          >
            <button
              style={{
                position: "absolute",
                top: "10px",
                right: "10px",
                background: "none",
                border: "none",
                fontSize: "24px",
                cursor: "pointer",
                color: "#666",
              }}
              onClick={() => setExpandedImage(null)}
            >
              ×
            </button>
            <img
              src={expandedImage}
              alt="Visualização Expandida"
              style={{
                maxWidth: "100%",
                maxHeight: "calc(90vh - 60px)",
                objectFit: "contain",
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </>
  );
}

function Login({ onError }) {
  const [loading, setLoading] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    if (!supabase)
      return onError(
        "Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env.",
      );
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });
    setLoading(false);
    if (error) onError(`Não foi possível entrar: ${error.message}`);
  };
  return (
    <div className="login">
      <div className="login-art">
        <div className="login-brand">
          <div className="brand-mark">
            <img
              src="/logo-guia-porto.png"
              alt="Agente Guia"
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </div>
          <strong>Agente Guia</strong>
        </div>
        <div className="art-copy">
          <span>PLATAFORMA DE GESTÃO</span>
          <h1>
            Seu destino,
            <br />
            <em>mais inteligente.</em>
          </h1>
          <p>
            Organize empresas, locais e experiências para tornar cada
            recomendação memorável.
          </p>
        </div>
        <div className="orb orb-one" />
        <div className="orb orb-two" />
      </div>
      <div className="login-form">
        <div className="mobile-brand">
          <div className="brand-mark">
            <img
              src="/logo-guia-porto.png"
              alt="Agente Guia"
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </div>
          <strong>Agente Guia</strong>
        </div>
        <form onSubmit={submit}>
          <div className="eyebrow">BEM-VINDO DE VOLTA</div>
          <h2>Acesse sua conta</h2>
          <p>Entre com suas credenciais para gerenciar o guia.</p>
          <Field label="E-mail">
            <Input
              name="email"
              type="email"
              defaultValue=""
              required
              placeholder="voce@empresa.com"
            />
          </Field>
          <Field label="Senha">
            <div className="password">
              <Input
                name="password"
                type="password"
                required
                placeholder="Sua senha"
              />
            </div>
          </Field>
          <div className="login-options">
            <label>
              <input type="checkbox" /> Lembrar de mim
            </label>
            <a href="#">Esqueci minha senha</a>
          </div>
          <button className="primary login-submit" disabled={loading}>
            {loading ? "Entrando..." : "Entrar na plataforma →"}
          </button>
        </form>
        <small className="copyright">
          © 2026 Agente Guia · Todos os direitos reservados
        </small>
      </div>
    </div>
  );
}
