import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, ListChecks, Tag, Bus, MapPin, Compass, Landmark } from "lucide-react";
import { supabase } from "./supabase.js";

// "Locais" (fisico, o que o Guia Porto recomenda) virou "Empresas" no menu, e o
// antigo "Empresas" (cadastro/CNPJ/aprovacao) virou "Empresas parceiras" — renomeado
// a pedido do Sr. Vitor pra bater com o vocabulario do outro painel
// (guia-porto-painel-empresas.vercel.app). As CHAVES internas (page state, nomes de
// tabela) continuam as mesmas de sempre — só o texto exibido mudou.
// ServicosLocais (20/08): balsa/lotação/van/etc — dado que o agente NAO consegue puxar
// via MCP/API de forma confiavel (ex: valor de balsa), entao passa a ser curado aqui
// direto, mesmo padrao de Locais (tabela propria, foto de capa, sem RAG).
// LocaisCidade (21/08): pontos de referencia que NAO aparecem no Google Maps nem no OSM
// (ponto de onibus/lotacao/van informal, ponto pouco conhecido etc) — precisam SEMPRE de
// lat/lon exatos, pois sao usados como referencia quando o turista pede "o mais proximo
// de mim" (busca por distancia real, mesma logica de servicos_locais).
// EmpresasTurismo (22/08): passeios (empresa de passeio, valor, foto de capa + galeria) —
// tabela propria (passeios/fotos_passeios), separada de Locais de proposito (pedido do Sr.
// Vitor: organiza melhor a indicacao). AINDA NAO entra no prompt do agente/recomendacao —
// isso fica pro "sistema algoritmico" combinado que vai indicar TODAS essas tabelas juntas,
// depois que todos os menus novos estiverem prontos.
// HistoriasCidade (22/08): pontos historicos curados a mao (nome, historia em texto longo,
// galeria de fotos, lat/lon OBRIGATORIOS) — mesma logica de "curar direto" de
// ServicosLocais/LocaisCidade, mas pra historia: complementa (nao substitui) a busca via
// MCP Historia/Wikipedia que o agente ja tem (historia.js) pra pontos que merecem cobertura
// hiper-local com foto propria. Tambem ainda NAO entra no prompt/recomendacao.
const PAGE_META = {
  Empresas: { label: "Empresas parceiras", singular: "Empresa parceira", Icon: Building2 },
  Locais: { label: "Empresas", singular: "Empresa", Icon: ListChecks },
  ServicosLocais: { label: "Serviços Locais", singular: "Serviço local", Icon: Bus },
  LocaisCidade: { label: "Locais da Cidade", singular: "Local da cidade", Icon: MapPin },
  EmpresasTurismo: { label: "Empresas Turismo", singular: "Passeio", Icon: Compass },
  HistoriasCidade: { label: "Histórias da Cidade", singular: "História", Icon: Landmark },
  Categorias: { label: "Categorias", singular: "Categoria", Icon: Tag },
};
const nav = ["Empresas", "Locais", "ServicosLocais", "LocaisCidade", "EmpresasTurismo", "HistoriasCidade", "Categorias"];
const emptyData = { categorias: [], empresas: [], locais: [], fotos: [], servicos: [], locaisCidade: [], passeios: [], fotosPasseios: [], historias: [], fotosHistorias: [] };

function gerarSlug(nome) {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

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
  const fetchTudo = useCallback(
    () =>
      Promise.all([
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
        supabase
          .from("servicos_locais")
          .select("*")
          .order("nome", { ascending: true }),
        supabase
          .from("locais_cidade")
          .select("*")
          .order("nome", { ascending: true }),
        supabase
          .from("passeios")
          .select("*")
          .order("nome", { ascending: true }),
        supabase
          .from("fotos_passeios")
          .select("*")
          .order("ordem", { ascending: true }),
        supabase
          .from("historias_cidade")
          .select("*")
          .order("nome", { ascending: true }),
        supabase
          .from("fotos_historias")
          .select("*")
          .order("ordem", { ascending: true }),
      ]),
    [],
  );

  const loadData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    let [categorias, empresas, locais, fotos, servicos, locaisCidade, passeios, fotosPasseios, historias, fotosHistorias] = await fetchTudo();
    let error = categorias.error || empresas.error || locais.error || fotos.error || servicos.error || locaisCidade.error || passeios.error || fotosPasseios.error || historias.error || fotosHistorias.error;
    // O token de sessao pode estar momentaneamente expirado logo apos o login ou
    // depois da aba ficar em segundo plano — isso aparece como erro de JWT na
    // primeira carga. Em vez de mostrar erro pro usuario, forca um refresh da
    // sessao e tenta buscar de novo uma vez antes de desistir.
    if (error && /jwt|token/i.test(error.message || "")) {
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError) {
        [categorias, empresas, locais, fotos, servicos, locaisCidade, passeios, fotosPasseios, historias, fotosHistorias] = await fetchTudo();
        error = categorias.error || empresas.error || locais.error || fotos.error || servicos.error || locaisCidade.error || passeios.error || fotosPasseios.error || historias.error || fotosHistorias.error;
      }
    }
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
        servicos: servicos.data || [],
        locaisCidade: locaisCidade.data || [],
        passeios: passeios.data || [],
        fotosPasseios: fotosPasseios.data || [],
        historias: historias.data || [],
        fotosHistorias: fotosHistorias.data || [],
      });
    setLoading(false);
  }, [fetchTudo]);

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
          : page === "ServicosLocais"
            ? data.servicos
            : page === "LocaisCidade"
              ? data.locaisCidade
              : page === "EmpresasTurismo"
                ? data.passeios
                : page === "HistoriasCidade"
                  ? data.historias
                  : data.categorias;
    const normalizedSearch = search.toLowerCase().trim();
    return list.filter((item) => {
      // ServicosLocais/LocaisCidade/EmpresasTurismo/HistoriasCidade nao tem categoria_id
      // (usam tipo_servico/tipo_local/nome_empresa/so texto, sem filtro dedicado ainda —
      // busca por texto ja cobre, ver "searchable" abaixo).
      const categoryMatches =
        page === "Categorias" ||
        page === "ServicosLocais" ||
        page === "LocaisCidade" ||
        page === "EmpresasTurismo" ||
        page === "HistoriasCidade" ||
        categoryFilter === "Todas" ||
        item.categoria_id === categoryFilter;
      const linkedPlace =
        page === "Empresas"
          ? data.locais.find((place) => place.empresa_id === item.id)
          : null;
      const searchable = [
        item.nome_fantasia,
        item.nome,
        item.nome_empresa,
        item.descricao,
        item.historia,
        item.endereco,
        item.telefone,
        item.categoria?.nome,
        item.tipo_servico,
        item.tipo_local,
        item.dica,
        item.valor,
        linkedPlace?.nome,
        linkedPlace?.descricao,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return categoryMatches && searchable.includes(normalizedSearch);
    });
  }, [data, page, search, categoryFilter]);
  const subtitles = {
    Empresas: "Gerencie os parceiros e negócios da plataforma.",
    Locais: "Organize os lugares que o Guia Porto recomenda.",
    ServicosLocais: "Balsa, lotação, van e outros serviços da região — dado que o agente não consegue confirmar por API, curamos aqui.",
    LocaisCidade: "Pontos de referência que não aparecem no Google Maps nem no OSM — ponto de ônibus, lotação, van, pontos pouco conhecidos.",
    EmpresasTurismo: "Passeios oferecidos por empresas de turismo da região — valor, empresa e fotos, separado dos outros locais.",
    HistoriasCidade: "Pontos históricos com a história completa, foto e localização — cobertura curada, além da busca automática do agente.",
    Categorias: "Defina como os locais são agrupados no aplicativo.",
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
      const slug = gerarSlug(values.nome);
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
        faixa_preco_alimentacao: values.faixa_preco_alimentacao || null,
        telefone: values.telefone || null,
        instagram: values.instagram || null,
        horario_funcionamento: values.horario_funcionamento || null,
        foto_capa_url: values.foto_capa_url || null,
        link_google_maps: values.link_google_maps || null,
        slug_nome: slug,
        link_google_maps_curto: `https://guiaporto.com.br/${slug}`,
        ativo: values.ativo === "on",
      };
    } else if (page === "ServicosLocais") {
      table = "servicos_locais";
      // Mesmo padrao do slug de Locais (guiaporto.com.br/<slug>) — link curto proprio em
      // vez de encurtador de terceiro, facilita o direcionamento do turista pro local.
      const slug = gerarSlug(values.nome);
      payload = {
        nome: values.nome,
        tipo_servico: values.tipo_servico,
        descricao: values.descricao || null,
        dica: values.dica || null,
        endereco: values.endereco || null,
        latitude: values.latitude ? Number(values.latitude) : null,
        longitude: values.longitude ? Number(values.longitude) : null,
        valor: values.valor || null,
        horario_funcionamento: values.horario_funcionamento || null,
        telefone: values.telefone || null,
        foto_capa_url: values.foto_capa_url || null,
        link_google_maps: values.link_google_maps || null,
        slug_nome: slug,
        link_google_maps_curto: `https://guiaporto.com.br/${slug}`,
        ativo: values.ativo === "on",
      };
    } else if (page === "LocaisCidade") {
      table = "locais_cidade";
      // Lat/lon aqui NAO e opcional (diferente de servicos_locais) — e' o dado essencial,
      // sem ele o ponto nao serve pra nada (nao tem como usar como referencia de distancia).
      const slug = gerarSlug(values.nome);
      payload = {
        nome: values.nome,
        tipo_local: values.tipo_local,
        descricao: values.descricao || null,
        endereco: values.endereco || null,
        latitude: Number(values.latitude),
        longitude: Number(values.longitude),
        foto_capa_url: values.foto_capa_url || null,
        link_google_maps: values.link_google_maps || null,
        slug_nome: slug,
        link_google_maps_curto: `https://guiaporto.com.br/${slug}`,
        ativo: values.ativo === "on",
      };
    } else if (page === "EmpresasTurismo") {
      table = "passeios";
      const slug = gerarSlug(values.nome);
      payload = {
        nome: values.nome,
        nome_empresa: values.nome_empresa || null,
        descricao: values.descricao || null,
        valor: values.valor || null,
        endereco: values.endereco || null,
        latitude: values.latitude ? Number(values.latitude) : null,
        longitude: values.longitude ? Number(values.longitude) : null,
        telefone: values.telefone || null,
        horario_funcionamento: values.horario_funcionamento || null,
        foto_capa_url: values.foto_capa_url || null,
        link_google_maps: values.link_google_maps || null,
        slug_nome: slug,
        link_google_maps_curto: `https://guiaporto.com.br/${slug}`,
        ativo: values.ativo === "on",
        atualizado_em: new Date().toISOString(),
      };
    } else if (page === "HistoriasCidade") {
      table = "historias_cidade";
      const slug = gerarSlug(values.nome);
      payload = {
        nome: values.nome,
        historia: values.historia || null,
        endereco: values.endereco || null,
        latitude: Number(values.latitude),
        longitude: Number(values.longitude),
        horario_funcionamento: values.horario_funcionamento || null,
        foto_capa_url: values.foto_capa_url || null,
        link_google_maps: values.link_google_maps || null,
        slug_nome: slug,
        link_google_maps_curto: `https://guiaporto.com.br/${slug}`,
        ativo: values.ativo === "on",
        atualizado_em: new Date().toISOString(),
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
    } else if (page === "ServicosLocais" && values._coverFile) {
      // So capa aqui (sem galeria de extras) — mesmo bucket "locais", pasta propria
      // pra nao misturar com os arquivos de locais fisicos.
      const servicoId = editingRecord?.id || result.data.id;
      const coverFile = values._coverFile;
      const extension = coverFile.name.includes(".")
        ? `.${coverFile.name.split(".").pop()}`
        : "";
      const path = `servico-${servicoId}/capa-${crypto.randomUUID()}${extension}`;
      const upload = await supabase.storage
        .from("locais")
        .upload(path, coverFile, { upsert: false, contentType: coverFile.type || undefined });
      if (upload.error) {
        setLoading(false);
        return showNotice(
          `Serviço salvo, mas não foi possível enviar a foto: ${upload.error.message}`,
          "error",
        );
      }
      const coverUrl = supabase.storage.from("locais").getPublicUrl(path).data.publicUrl;
      const coverUpdate = await supabase
        .from("servicos_locais")
        .update({ foto_capa_url: coverUrl, atualizado_em: new Date().toISOString() })
        .eq("id", servicoId);
      if (coverUpdate.error) {
        setLoading(false);
        return showNotice(
          `Serviço salvo, mas não foi possível salvar a foto: ${coverUpdate.error.message}`,
          "error",
        );
      }
    } else if (page === "LocaisCidade" && values._coverFile) {
      // Mesma logica de ServicosLocais — so capa, mesmo bucket "locais", pasta propria.
      const localCidadeId = editingRecord?.id || result.data.id;
      const coverFile = values._coverFile;
      const extension = coverFile.name.includes(".")
        ? `.${coverFile.name.split(".").pop()}`
        : "";
      const path = `local-cidade-${localCidadeId}/capa-${crypto.randomUUID()}${extension}`;
      const upload = await supabase.storage
        .from("locais")
        .upload(path, coverFile, { upsert: false, contentType: coverFile.type || undefined });
      if (upload.error) {
        setLoading(false);
        return showNotice(
          `Local salvo, mas não foi possível enviar a foto: ${upload.error.message}`,
          "error",
        );
      }
      const coverUrl = supabase.storage.from("locais").getPublicUrl(path).data.publicUrl;
      const coverUpdate = await supabase
        .from("locais_cidade")
        .update({ foto_capa_url: coverUrl, atualizado_em: new Date().toISOString() })
        .eq("id", localCidadeId);
      if (coverUpdate.error) {
        setLoading(false);
        return showNotice(
          `Local salvo, mas não foi possível salvar a foto: ${coverUpdate.error.message}`,
          "error",
        );
      }
    } else if (page === "EmpresasTurismo") {
      // Mesma logica de Locais (capa + galeria de extras) — mesmo bucket "locais",
      // pasta propria "passeio-<id>", tabela de galeria propria (fotos_passeios).
      const passeioId = editingRecord?.id || result.data.id;
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
        const path = `passeio-${passeioId}/${folder}-${crypto.randomUUID()}${extension}`;
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
          const deletedPhotos = data.fotosPasseios.filter((photo) => deletedPhotoIds.includes(photo.id));
          const paths = deletedPhotos.map((photo) => getStoragePath(photo.url)).filter(Boolean);
          if (paths.length) {
            const storageDelete = await supabase.storage.from("locais").remove(paths);
            if (storageDelete.error) throw storageDelete.error;
          }
          const photosDelete = await supabase.from("fotos_passeios").delete().in("id", deletedPhotoIds);
          if (photosDelete.error) throw photosDelete.error;
        }
        if (coverFile) {
          const coverUrl = await uploadFile(coverFile, "capa");
          const coverUpdate = await supabase
            .from("passeios")
            .update({ foto_capa_url: coverUrl })
            .eq("id", passeioId);
          if (coverUpdate.error) throw coverUpdate.error;
        }
        if (extraFiles.length) {
          const currentPhotos = data.fotosPasseios.filter(
            (photo) => photo.passeio_id === passeioId,
          );
          const uploadedPhotos = [];
          for (const [index, file] of extraFiles.entries())
            uploadedPhotos.push({
              passeio_id: passeioId,
              url: await uploadFile(file, "extra"),
              ordem: currentPhotos.length + index + 1,
            });
          const photosInsert = await supabase
            .from("fotos_passeios")
            .insert(uploadedPhotos);
          if (photosInsert.error) throw photosInsert.error;
        }
      } catch (uploadError) {
        setLoading(false);
        return showNotice(
          `Passeio salvo, mas não foi possível enviar as fotos: ${uploadError.message}`,
          "error",
        );
      }
    } else if (page === "HistoriasCidade") {
      // Mesma logica de Locais/EmpresasTurismo (capa + galeria de extras) — mesmo bucket
      // "locais", pasta propria "historia-<id>", tabela de galeria propria (fotos_historias).
      const historiaId = editingRecord?.id || result.data.id;
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
        const path = `historia-${historiaId}/${folder}-${crypto.randomUUID()}${extension}`;
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
          const deletedPhotos = data.fotosHistorias.filter((photo) => deletedPhotoIds.includes(photo.id));
          const paths = deletedPhotos.map((photo) => getStoragePath(photo.url)).filter(Boolean);
          if (paths.length) {
            const storageDelete = await supabase.storage.from("locais").remove(paths);
            if (storageDelete.error) throw storageDelete.error;
          }
          const photosDelete = await supabase.from("fotos_historias").delete().in("id", deletedPhotoIds);
          if (photosDelete.error) throw photosDelete.error;
        }
        if (coverFile) {
          const coverUrl = await uploadFile(coverFile, "capa");
          const coverUpdate = await supabase
            .from("historias_cidade")
            .update({ foto_capa_url: coverUrl })
            .eq("id", historiaId);
          if (coverUpdate.error) throw coverUpdate.error;
        }
        if (extraFiles.length) {
          const currentPhotos = data.fotosHistorias.filter(
            (photo) => photo.historia_id === historiaId,
          );
          const uploadedPhotos = [];
          for (const [index, file] of extraFiles.entries())
            uploadedPhotos.push({
              historia_id: historiaId,
              url: await uploadFile(file, "extra"),
              ordem: currentPhotos.length + index + 1,
            });
          const photosInsert = await supabase
            .from("fotos_historias")
            .insert(uploadedPhotos);
          if (photosInsert.error) throw photosInsert.error;
        }
      } catch (uploadError) {
        setLoading(false);
        return showNotice(
          `História salva, mas não foi possível enviar as fotos: ${uploadError.message}`,
          "error",
        );
      }
    }
    setLoading(false);
    setModal(false);
    setEditingRecord(null);
    showNotice(
      `${PAGE_META[page].singular} ${editingRecord ? "atualizado" : "salvo"} com sucesso.`,
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
          : page === "ServicosLocais"
            ? "servicos_locais"
            : page === "LocaisCidade"
              ? "locais_cidade"
              : page === "EmpresasTurismo"
                ? "passeios"
                : page === "HistoriasCidade"
                  ? "historias_cidade"
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
    showNotice(`${PAGE_META[page].singular} excluído com sucesso.`);
    await loadData();
  }
  if (!session)
    return <Login onError={(message) => showNotice(message, "error")} />;
  const subtitle = subtitles[page];
  const activeCompanies = data.empresas.filter(
    (x) => x.status === "ativo",
  ).length;
  const pendingCompanies = data.empresas.filter(
    (x) => x.status === "pendente_aprovacao",
  ).length;
  const activePlaces = data.locais.filter((x) => x.ativo).length;
  const publicPlaces = data.locais.filter((x) => !x.empresa_id).length;
  const activeServices = data.servicos.filter((x) => x.ativo).length;
  const activeCityPlaces = data.locaisCidade.filter((x) => x.ativo).length;
  const activeTours = data.passeios.filter((x) => x.ativo).length;
  const activeHistorias = data.historias.filter((x) => x.ativo).length;
  return (
    <div className="app-shell">
      <aside className={menuOpen ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="brand-mark">
            <img
              src="/logo-guia-porto.png"
              alt="Guia Porto"
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </div>
          <div>
            <strong>Guia Porto</strong>
            <small>Painel de gestão</small>
          </div>
          <button className="close" onClick={() => setMenuOpen(false)}>
            ×
          </button>
        </div>
        <nav>
          {nav.map((key) => {
            const { label, Icon } = PAGE_META[key];
            return (
              <button
                className={page === key ? "nav-item active" : "nav-item"}
                key={key}
                onClick={() => {
                  setPage(key);
                  setMenuOpen(false);
                  setSearch("");
                  setCategoryFilter("Todas");
                }}
              >
                <Icon size={17} strokeWidth={2} />
                {label}
              </button>
            );
          })}
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
            Gestão <span>/</span> {PAGE_META[page].label}
          </div>
          <div className="header-actions">
            <button className="help">?</button>
            <button className="avatar">VG</button>
          </div>
        </header>
        <section className="content">
          <div className="title-row">
            <div>
              <h1>{PAGE_META[page].label}</h1>
              <p>
                {page === "Categorias"
                  ? subtitle
                  : `${(
                      page === "Empresas"
                        ? data.empresas
                        : page === "ServicosLocais"
                          ? data.servicos
                          : page === "LocaisCidade"
                            ? data.locaisCidade
                            : page === "EmpresasTurismo"
                              ? data.passeios
                              : page === "HistoriasCidade"
                                ? data.historias
                                : data.locais
                    ).length} no total`}
              </p>
            </div>
            <button
              className="primary"
              onClick={() => {
                setEditingRecord(null);
                setModal(true);
              }}
            >
              ＋ {page === "ServicosLocais" || page === "LocaisCidade" || page === "EmpresasTurismo" ? "Novo" : "Nova"} {PAGE_META[page].singular}
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
                <Stat value={data.locais.length} label="Empresas cadastradas" />
                <Stat value={activePlaces} label="Empresas ativas" />
                <Stat value={publicPlaces} label="Pontos públicos" />
              </>
            )}
            {page === "ServicosLocais" && (
              <>
                <Stat value={data.servicos.length} label="Serviços cadastrados" />
                <Stat value={activeServices} label="Serviços ativos" />
              </>
            )}
            {page === "LocaisCidade" && (
              <>
                <Stat value={data.locaisCidade.length} label="Locais cadastrados" />
                <Stat value={activeCityPlaces} label="Locais ativos" />
              </>
            )}
            {page === "EmpresasTurismo" && (
              <>
                <Stat value={data.passeios.length} label="Passeios cadastrados" />
                <Stat value={activeTours} label="Passeios ativos" />
              </>
            )}
            {page === "HistoriasCidade" && (
              <>
                <Stat value={data.historias.length} label="Histórias cadastradas" />
                <Stat value={activeHistorias} label="Histórias ativas" />
              </>
            )}
            {page === "Categorias" && (
              <>
                <Stat value={data.categorias.length} label="Categorias" />
                <Stat value={data.locais.length} label="Empresas organizadas" />
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
                  placeholder={`Buscar ${PAGE_META[page].label.toLowerCase()}...`}
                />
              </div>
              {page !== "Categorias" && page !== "ServicosLocais" && page !== "LocaisCidade" && page !== "EmpresasTurismo" && page !== "HistoriasCidade" && (
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
          photos={
            page === "EmpresasTurismo"
              ? data.fotosPasseios.filter((photo) => photo.passeio_id === editingRecord?.id)
              : page === "HistoriasCidade"
                ? data.fotosHistorias.filter((photo) => photo.historia_id === editingRecord?.id)
                : data.fotos.filter((photo) => photo.local_id === editingRecord?.id)
          }
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
                  {place?.descricao || "Empresa parceira do Guia Porto."}
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
  if (page === "ServicosLocais")
    return rows.length ? (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {["Serviço", "Tipo", "Valor", "Horário", "Status", ""].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id}>
                <td>
                  <b>{x.nome}</b>
                  {x.foto_capa_url && <small>com foto</small>}
                </td>
                <td>
                  <span className="pill">{x.tipo_servico}</span>
                </td>
                <td>{x.valor || "—"}</td>
                <td>{x.horario_funcionamento ? "Definido" : "—"}</td>
                <td>
                  <Status value={x.ativo ? "ativo" : "inativo"} />
                </td>
                <td>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="icon-button edit"
                      onClick={() => onEdit(x)}
                      title="Editar"
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      </div>
    ) : (
      <div className="empty">
        {loading ? "Carregando dados..." : "Ainda não há serviços cadastrados."}
      </div>
    );
  if (page === "LocaisCidade")
    return rows.length ? (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {["Local", "Tipo", "Endereço", "Coordenadas", "Status", ""].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id}>
                <td>
                  <b>{x.nome}</b>
                  {x.foto_capa_url && <small>com foto</small>}
                </td>
                <td>
                  <span className="pill">{x.tipo_local}</span>
                </td>
                <td>{x.endereco || "—"}</td>
                <td>
                  <small>{x.latitude?.toFixed(5)}, {x.longitude?.toFixed(5)}</small>
                </td>
                <td>
                  <Status value={x.ativo ? "ativo" : "inativo"} />
                </td>
                <td>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="icon-button edit"
                      onClick={() => onEdit(x)}
                      title="Editar"
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      </div>
    ) : (
      <div className="empty">
        {loading ? "Carregando dados..." : "Ainda não há locais cadastrados."}
      </div>
    );
  if (page === "EmpresasTurismo")
    return rows.length ? (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {["Passeio", "Empresa", "Valor", "Status", ""].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id}>
                <td>
                  <b>{x.nome}</b>
                  {x.foto_capa_url && <small>com foto</small>}
                </td>
                <td>{x.nome_empresa || "—"}</td>
                <td>{x.valor || "—"}</td>
                <td>
                  <Status value={x.ativo ? "ativo" : "inativo"} />
                </td>
                <td>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="icon-button edit"
                      onClick={() => onEdit(x)}
                      title="Editar"
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      </div>
    ) : (
      <div className="empty">
        {loading ? "Carregando dados..." : "Ainda não há passeios cadastrados."}
      </div>
    );
  if (page === "HistoriasCidade")
    return rows.length ? (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {["Nome", "Endereço", "Coordenadas", "Status", ""].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id}>
                <td>
                  <b>{x.nome}</b>
                  {x.foto_capa_url && <small>com foto</small>}
                </td>
                <td>{x.endereco || "—"}</td>
                <td>
                  <small>{x.latitude?.toFixed(5)}, {x.longitude?.toFixed(5)}</small>
                </td>
                <td>
                  <Status value={x.ativo ? "ativo" : "inativo"} />
                </td>
                <td>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="icon-button edit"
                      onClick={() => onEdit(x)}
                      title="Editar"
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      </div>
    ) : (
      <div className="empty">
        {loading ? "Carregando dados..." : "Ainda não há histórias cadastradas."}
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
              Deseja realmente excluir este {PAGE_META[page].singular.toLowerCase()}?
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

const weekDays = [
  ["seg", "Seg"],
  ["ter", "Ter"],
  ["qua", "Qua"],
  ["qui", "Qui"],
  ["sex", "Sex"],
  ["sab", "Sáb"],
  ["dom", "Dom"],
];

function initialSchedule(value) {
  if (!value) return [{ days: [], start: "09:00", end: "18:00" }];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {
    return [{ days: [], start: "", end: "", legacy: value }];
  }
  return [{ days: [], start: "09:00", end: "18:00" }];
}

function ScheduleEditor({ value, onChange }) {
  const [schedule, setSchedule] = useState(() => initialSchedule(value));
  const update = (next) => {
    setSchedule(next);
    onChange(JSON.stringify(next));
  };
  const toggleDay = (rowIndex, day) => update(schedule.map((row, index) => index === rowIndex ? { ...row, days: row.days.includes(day) ? row.days.filter((item) => item !== day) : [...row.days, day] } : row));
  const updateTime = (rowIndex, field, time) => update(schedule.map((row, index) => index === rowIndex ? { ...row, [field]: time } : row));
  return <div className="schedule-editor full">
    <span className="schedule-label">HORÁRIO</span>
    {schedule.map((row, rowIndex) => <div className="schedule-row" key={rowIndex}>
      <div className="day-list">{weekDays.map(([key, label]) => <button type="button" key={key} className={row.days.includes(key) ? "day-button selected" : "day-button"} onClick={() => toggleDay(rowIndex, key)}>{label}</button>)}</div>
      <div className="time-list"><label><input type="time" value={row.start} onChange={(event) => updateTime(rowIndex, "start", event.target.value)} /><span>◷</span></label><em>até</em><label><input type="time" value={row.end} onChange={(event) => updateTime(rowIndex, "end", event.target.value)} /><span>◷</span></label></div>
    </div>)}
    <button type="button" className="add-schedule" onClick={() => update([...schedule, { days: [], start: "09:00", end: "18:00" }])}>+ adicionar outro horário (ex: sábado diferente)</button>
  </div>;
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
    isPlace = page === "Locais",
    isService = page === "ServicosLocais",
    isCityPlace = page === "LocaisCidade",
    isTour = page === "EmpresasTurismo",
    isHistoria = page === "HistoriasCidade";
  const [previewUrl, setPreviewUrl] = useState(record?.foto_capa_url || "");
  const [coverFile, setCoverFile] = useState(null);
  const [extraFiles, setExtraFiles] = useState([]);
  const [deletedPhotoIds, setDeletedPhotoIds] = useState([]);
  const [scheduleValue, setScheduleValue] = useState(record?.horario_funcionamento || "");
  const [formValues, setFormValues] = useState({});
  const [expandedImage, setExpandedImage] = useState(null);

  const handleInputChange = (e) => {
    if (e.target.name === "foto_capa_url") setPreviewUrl(e.target.value);
    setFormValues({ ...formValues, [e.target.name]: e.target.value });
  };

  const extractLatLng = (mapsUrl) => {
    if (!mapsUrl) return { lat: "", lng: "" };
    // !3d/!4d e o pino exato que o Google salvou (mais preciso); @lat,lng e so o centro
    // da tela no momento em que o link foi copiado (pode estar levemente deslocado se
    // quem copiou tinha arrastado/dado zoom no mapa antes).
    let match = mapsUrl.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
    if (match) return { lat: match[1], lng: match[2] };
    match = mapsUrl.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (match) return { lat: match[1], lng: match[2] };
    match = mapsUrl.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (match) return { lat: match[1], lng: match[2] };
    return { lat: "", lng: "" };
  };

  const [coordStatus, setCoordStatus] = useState("");

  // Roda quando o usuario sai do campo de Link Google Maps (colar + Tab/clicar fora).
  // Link completo ja tem lat/lng embutido, resolve local e na hora. Link CURTO
  // (maps.app.goo.gl) nao tem coordenada na URL — precisa seguir o redirect, e isso o
  // navegador nao consegue fazer sozinho (CORS), por isso cai pro endpoint /api/resolver-maps.
  const handleMapsLinkBlur = async (e) => {
    const url = e.target.value.trim();
    const form = e.target.form;
    if (!url || !form) return;
    const latInput = form.querySelector('input[name="latitude"]');
    const lngInput = form.querySelector('input[name="longitude"]');
    if (!latInput || !lngInput) return;

    let coords = extractLatLng(url);
    if (!coords.lat) {
      setCoordStatus("Buscando coordenadas no link…");
      try {
        const resp = await fetch(`/api/resolver-maps?url=${encodeURIComponent(url)}`);
        const dados = await resp.json();
        if (dados.lat) coords = { lat: dados.lat, lng: dados.lng };
      } catch {
        // segue com coords vazio, cai no status de erro abaixo
      }
    }

    if (coords.lat && coords.lng) {
      latInput.value = coords.lat;
      lngInput.value = coords.lng;
      setCoordStatus("📍 Latitude e longitude preenchidas automaticamente a partir do link.");
    } else {
      setCoordStatus("Não consegui achar coordenadas nesse link — preencha latitude/longitude manualmente.");
    }
  };

  const submit = (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    values._coverFile = coverFile;
    values._extraFiles = extraFiles;
    values._deletedPhotoIds = deletedPhotoIds;
    values.horario_funcionamento = scheduleValue;
    save(values);
  };
  return (
    <>
      <div className="modal-layer">
        <form className="modal" onSubmit={submit}>
          <div className="modal-header">
            <div>
              <h2>
                {record ? "Editar" : page === "ServicosLocais" || page === "LocaisCidade" || page === "EmpresasTurismo" ? "Novo" : "Nova"} {PAGE_META[page].singular}
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
                <Field label="Faixa de alimentação (R$)">
                  <input
                    type="text"
                    name="faixa_preco_alimentacao"
                    defaultValue={record?.faixa_preco_alimentacao || ""}
                    placeholder="Ex: A partir de R$125 - R$245"
                  />
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
                <ScheduleEditor
                  value={record?.horario_funcionamento || ""}
                  onChange={setScheduleValue}
                />
                <Field label="Link Google Maps" full>
                  <Input
                    name="link_google_maps"
                    type="url"
                    onChange={handleInputChange}
                    onBlur={handleMapsLinkBlur}
                    defaultValue={record?.link_google_maps || ""}
                    placeholder="https://maps.google.com/?q=... (aceita link curto maps.app.goo.gl)"
                  />
                  {coordStatus && <small className="coord-status">{coordStatus}</small>}
                </Field>
                <Field label="Link curto (gerado automaticamente pelo nome)" full>
                  <Input
                    value={record?.link_google_maps_curto || "gerado ao salvar, a partir do nome da empresa"}
                    readOnly
                    disabled
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
                <div className="photos-section full">
                  <h3>Fotos</h3>
                  <p className="photos-hint">
                    A capa é a foto que o agente manda nas recomendações; as
                    extras aparecem quando o turista pede mais detalhes.
                  </p>
                  <div className="photo-cover-row">
                    {previewUrl ? (
                      <PhotoPreview
                        src={previewUrl}
                        alt="Foto de capa"
                        cover
                        removable={!!coverFile}
                        onOpen={() => setExpandedImage(previewUrl)}
                        onRemove={() => {
                          setCoverFile(null);
                          setPreviewUrl(record?.foto_capa_url || "");
                        }}
                      />
                    ) : (
                      <div className="photo-cover-empty">Sem foto de capa ainda</div>
                    )}
                  </div>
                  {(photos.length > 0 || extraFiles.length > 0) && (
                    <div className="photo-previews">
                      {photos
                        .filter((photo) => !deletedPhotoIds.includes(photo.id))
                        .map((photo) => (
                          <PhotoPreview
                            key={photo.id}
                            src={photo.url}
                            alt={photo.legenda || "Foto do local"}
                            removable
                            onOpen={() => setExpandedImage(photo.url)}
                            onRemove={() =>
                              setDeletedPhotoIds((current) => [...current, photo.id])
                            }
                          />
                        ))}
                      {extraFiles.map((file, index) => {
                        const fileUrl = URL.createObjectURL(file);
                        return (
                          <PhotoPreview
                            key={`${file.name}-${index}`}
                            src={fileUrl}
                            alt={file.name}
                            removable
                            onOpen={() => setExpandedImage(fileUrl)}
                            onRemove={() =>
                              setExtraFiles((current) =>
                                current.filter((_, fileIndex) => fileIndex !== index),
                              )
                            }
                          />
                        );
                      })}
                    </div>
                  )}
                  <div className="photo-pickers">
                    <PhotoPicker
                      label={previewUrl ? "Trocar capa" : "Nova capa"}
                      hint="Essa é a que o agente manda nas recomendações"
                      files={coverFile ? [coverFile] : []}
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        setCoverFile(file);
                        if (file) setPreviewUrl(URL.createObjectURL(file));
                      }}
                    />
                    <PhotoPicker
                      label="+ Fotos extras"
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
                </div>
              </>
            )}
            {isService && (
              <>
                <Field label="Nome do serviço">
                  <Input
                    name="nome"
                    defaultValue={record?.nome || ""}
                    required
                    placeholder="Ex.: Balsa Porto Seguro – Arraial d'Ajuda"
                  />
                </Field>
                <Field label="Tipo de serviço">
                  <Input
                    name="tipo_servico"
                    defaultValue={record?.tipo_servico || ""}
                    required
                    placeholder="Ex.: balsa, lotação, van, buggy, taxi"
                    list="tipos-servico-sugeridos"
                  />
                  <datalist id="tipos-servico-sugeridos">
                    <option value="balsa" />
                    <option value="lotação" />
                    <option value="van" />
                    <option value="buggy" />
                    <option value="taxi" />
                  </datalist>
                </Field>
                <Field label="Valor">
                  <Input
                    name="valor"
                    defaultValue={record?.valor || ""}
                    placeholder="Ex.: R$ 15 por pessoa"
                  />
                </Field>
                <Field label="Descrição" full>
                  <textarea
                    name="descricao"
                    defaultValue={record?.descricao || ""}
                    placeholder="O que é este serviço?"
                  />
                </Field>
                <Field label="Dica pra quem for procurar" full>
                  <textarea
                    name="dica"
                    defaultValue={record?.dica || ""}
                    placeholder="Ex.: chega 10 min antes, costuma lotar no fim de tarde"
                  />
                </Field>
                <Field label="Endereço/local de embarque" full>
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
                <ScheduleEditor
                  value={record?.horario_funcionamento || ""}
                  onChange={setScheduleValue}
                />
                <Field label="Link Google Maps" full>
                  <Input
                    name="link_google_maps"
                    type="url"
                    onChange={handleInputChange}
                    onBlur={handleMapsLinkBlur}
                    defaultValue={record?.link_google_maps || ""}
                    placeholder="https://maps.google.com/?q=... (aceita link curto maps.app.goo.gl)"
                  />
                  {coordStatus && <small className="coord-status">{coordStatus}</small>}
                </Field>
                <Field label="Link curto (gerado automaticamente pelo nome)" full>
                  <Input
                    value={record?.link_google_maps_curto || "gerado ao salvar, a partir do nome do serviço"}
                    readOnly
                    disabled
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
                    placeholder="-16.44"
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
                    placeholder="-39.07"
                  />
                </Field>
                <Field full label="">
                  <span className="check-line">
                    <input
                      name="ativo"
                      type="checkbox"
                      defaultChecked={record?.ativo ?? true}
                    />{" "}
                    Serviço ativo e visível no Guia
                  </span>
                </Field>
                <div className="photos-section full">
                  <h3>Foto de capa</h3>
                  <p className="photos-hint">
                    Foto que o agente manda quando recomenda esse serviço.
                  </p>
                  <div className="photo-cover-row">
                    {previewUrl ? (
                      <PhotoPreview
                        src={previewUrl}
                        alt="Foto de capa"
                        cover
                        removable={!!coverFile}
                        onOpen={() => setExpandedImage(previewUrl)}
                        onRemove={() => {
                          setCoverFile(null);
                          setPreviewUrl(record?.foto_capa_url || "");
                        }}
                      />
                    ) : (
                      <div className="photo-cover-empty">Sem foto de capa ainda</div>
                    )}
                  </div>
                  <div className="photo-pickers">
                    <PhotoPicker
                      label={previewUrl ? "Trocar capa" : "Nova capa"}
                      hint="Foto principal do serviço"
                      files={coverFile ? [coverFile] : []}
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        setCoverFile(file);
                        if (file) setPreviewUrl(URL.createObjectURL(file));
                      }}
                    />
                  </div>
                </div>
              </>
            )}
            {isCityPlace && (
              <>
                <Field label="Nome do local">
                  <Input
                    name="nome"
                    defaultValue={record?.nome || ""}
                    required
                    placeholder="Ex.: Ponto de ônibus - Praça dos Pataxós"
                  />
                </Field>
                <Field label="Tipo">
                  <Input
                    name="tipo_local"
                    defaultValue={record?.tipo_local || ""}
                    required
                    placeholder="Ex.: ponto_onibus, ponto_lotacao, ponto_van"
                    list="tipos-local-cidade-sugeridos"
                  />
                  <datalist id="tipos-local-cidade-sugeridos">
                    <option value="ponto_onibus" />
                    <option value="ponto_lotacao" />
                    <option value="ponto_van" />
                    <option value="ponto_pouco_conhecido" />
                    <option value="outro" />
                  </datalist>
                </Field>
                <Field label="Descrição" full>
                  <textarea
                    name="descricao"
                    defaultValue={record?.descricao || ""}
                    placeholder="O que tem nesse ponto? Alguma referência pra achar mais fácil?"
                  />
                </Field>
                <Field label="Endereço/referência" full>
                  <Input
                    name="endereco"
                    defaultValue={record?.endereco || ""}
                    placeholder="Rua, esquina, ponto de referência"
                  />
                </Field>
                <Field label="Link Google Maps (opcional, só pra ajudar a pegar lat/lon)" full>
                  <Input
                    name="link_google_maps"
                    type="url"
                    onChange={handleInputChange}
                    onBlur={handleMapsLinkBlur}
                    defaultValue={record?.link_google_maps || ""}
                    placeholder="https://maps.google.com/?q=... (aceita link curto maps.app.goo.gl)"
                  />
                  {coordStatus && <small className="coord-status">{coordStatus}</small>}
                </Field>
                <Field label="Latitude (obrigatório)">
                  <Input
                    name="latitude"
                    type="number"
                    step="any"
                    required
                    defaultValue={
                      record?.latitude ??
                      extractLatLng(record?.link_google_maps || "").lat
                    }
                    placeholder="-16.44"
                  />
                </Field>
                <Field label="Longitude (obrigatório)">
                  <Input
                    name="longitude"
                    type="number"
                    step="any"
                    required
                    defaultValue={
                      record?.longitude ??
                      extractLatLng(record?.link_google_maps || "").lng
                    }
                    placeholder="-39.07"
                  />
                </Field>
                <Field label="Link curto (gerado automaticamente pelo nome)" full>
                  <Input
                    value={record?.link_google_maps_curto || "gerado ao salvar, a partir do nome do local"}
                    readOnly
                    disabled
                  />
                </Field>
                <Field full label="">
                  <span className="check-line">
                    <input
                      name="ativo"
                      type="checkbox"
                      defaultChecked={record?.ativo ?? true}
                    />{" "}
                    Local ativo e usável como referência pelo agente
                  </span>
                </Field>
                <div className="photos-section full">
                  <h3>Foto de capa (opcional)</h3>
                  <p className="photos-hint">
                    Nem todo ponto precisa de foto — use quando ajudar a identificar o local.
                  </p>
                  <div className="photo-cover-row">
                    {previewUrl ? (
                      <PhotoPreview
                        src={previewUrl}
                        alt="Foto de capa"
                        cover
                        removable={!!coverFile}
                        onOpen={() => setExpandedImage(previewUrl)}
                        onRemove={() => {
                          setCoverFile(null);
                          setPreviewUrl(record?.foto_capa_url || "");
                        }}
                      />
                    ) : (
                      <div className="photo-cover-empty">Sem foto de capa ainda</div>
                    )}
                  </div>
                  <div className="photo-pickers">
                    <PhotoPicker
                      label={previewUrl ? "Trocar capa" : "Nova capa"}
                      hint="Foto do ponto, se ajudar"
                      files={coverFile ? [coverFile] : []}
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        setCoverFile(file);
                        if (file) setPreviewUrl(URL.createObjectURL(file));
                      }}
                    />
                  </div>
                </div>
              </>
            )}
            {isTour && (
              <>
                <Field label="Nome do passeio">
                  <Input
                    name="nome"
                    defaultValue={record?.nome || ""}
                    required
                    placeholder="Ex.: Passeio de escuna às Coroa Vermelha"
                  />
                </Field>
                <Field label="Empresa do passeio">
                  <Input
                    name="nome_empresa"
                    defaultValue={record?.nome_empresa || ""}
                    placeholder="Nome da empresa que oferece o passeio"
                  />
                </Field>
                <Field label="Valor do passeio" full>
                  <Input
                    name="valor"
                    defaultValue={record?.valor || ""}
                    placeholder="Ex.: R$150 por pessoa (criança até 6 anos grátis)"
                  />
                </Field>
                <Field label="Descrição" full>
                  <textarea
                    name="descricao"
                    defaultValue={record?.descricao || ""}
                    placeholder="O que é esse passeio? O que está incluso?"
                  />
                </Field>
                <Field label="Endereço/ponto de encontro" full>
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
                <ScheduleEditor
                  value={record?.horario_funcionamento || ""}
                  onChange={setScheduleValue}
                />
                <Field label="Link Google Maps" full>
                  <Input
                    name="link_google_maps"
                    type="url"
                    onChange={handleInputChange}
                    onBlur={handleMapsLinkBlur}
                    defaultValue={record?.link_google_maps || ""}
                    placeholder="https://maps.google.com/?q=... (aceita link curto maps.app.goo.gl)"
                  />
                  {coordStatus && <small className="coord-status">{coordStatus}</small>}
                </Field>
                <Field label="Link curto (gerado automaticamente pelo nome)" full>
                  <Input
                    value={record?.link_google_maps_curto || "gerado ao salvar, a partir do nome do passeio"}
                    readOnly
                    disabled
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
                    placeholder="-16.44"
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
                    placeholder="-39.07"
                  />
                </Field>
                <Field full label="">
                  <span className="check-line">
                    <input
                      name="ativo"
                      type="checkbox"
                      defaultChecked={record?.ativo ?? true}
                    />{" "}
                    Passeio ativo e visível no Guia
                  </span>
                </Field>
                <div className="photos-section full">
                  <h3>Fotos</h3>
                  <p className="photos-hint">
                    A capa é a foto que o agente manda de início nas recomendações; as
                    extras aparecem quando o turista pede mais detalhes do passeio.
                  </p>
                  <div className="photo-cover-row">
                    {previewUrl ? (
                      <PhotoPreview
                        src={previewUrl}
                        alt="Foto de capa"
                        cover
                        removable={!!coverFile}
                        onOpen={() => setExpandedImage(previewUrl)}
                        onRemove={() => {
                          setCoverFile(null);
                          setPreviewUrl(record?.foto_capa_url || "");
                        }}
                      />
                    ) : (
                      <div className="photo-cover-empty">Sem foto de capa ainda</div>
                    )}
                  </div>
                  {(photos.length > 0 || extraFiles.length > 0) && (
                    <div className="photo-previews">
                      {photos
                        .filter((photo) => !deletedPhotoIds.includes(photo.id))
                        .map((photo) => (
                          <PhotoPreview
                            key={photo.id}
                            src={photo.url}
                            alt={photo.legenda || "Foto do passeio"}
                            removable
                            onOpen={() => setExpandedImage(photo.url)}
                            onRemove={() =>
                              setDeletedPhotoIds((current) => [...current, photo.id])
                            }
                          />
                        ))}
                      {extraFiles.map((file, index) => {
                        const fileUrl = URL.createObjectURL(file);
                        return (
                          <PhotoPreview
                            key={`${file.name}-${index}`}
                            src={fileUrl}
                            alt={file.name}
                            removable
                            onOpen={() => setExpandedImage(fileUrl)}
                            onRemove={() =>
                              setExtraFiles((current) =>
                                current.filter((_, fileIndex) => fileIndex !== index),
                              )
                            }
                          />
                        );
                      })}
                    </div>
                  )}
                  <div className="photo-pickers">
                    <PhotoPicker
                      label={previewUrl ? "Trocar capa" : "Nova capa"}
                      hint="Essa é a que o agente manda de início nas recomendações"
                      files={coverFile ? [coverFile] : []}
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        setCoverFile(file);
                        if (file) setPreviewUrl(URL.createObjectURL(file));
                      }}
                    />
                    <PhotoPicker
                      label="+ Fotos extras"
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
                </div>
              </>
            )}
            {isHistoria && (
              <>
                <Field label="Nome do ponto histórico">
                  <Input
                    name="nome"
                    defaultValue={record?.nome || ""}
                    required
                    placeholder="Ex.: Marco do Descobrimento"
                  />
                </Field>
                <Field label="Endereço/referência">
                  <Input
                    name="endereco"
                    defaultValue={record?.endereco || ""}
                    placeholder="Rua, esquina, ponto de referência"
                  />
                </Field>
                <Field label="História" full>
                  <textarea
                    name="historia"
                    defaultValue={record?.historia || ""}
                    placeholder="A história completa desse ponto — o que aconteceu aqui, curiosidades, contexto"
                  />
                </Field>
                <ScheduleEditor
                  value={record?.horario_funcionamento || ""}
                  onChange={setScheduleValue}
                />
                <Field label="Link Google Maps" full>
                  <Input
                    name="link_google_maps"
                    type="url"
                    onChange={handleInputChange}
                    onBlur={handleMapsLinkBlur}
                    defaultValue={record?.link_google_maps || ""}
                    placeholder="https://maps.google.com/?q=... (aceita link curto maps.app.goo.gl)"
                  />
                  {coordStatus && <small className="coord-status">{coordStatus}</small>}
                </Field>
                <Field label="Latitude (obrigatório)">
                  <Input
                    name="latitude"
                    type="number"
                    step="any"
                    required
                    defaultValue={
                      record?.latitude ??
                      extractLatLng(record?.link_google_maps || "").lat
                    }
                    placeholder="-16.44"
                  />
                </Field>
                <Field label="Longitude (obrigatório)">
                  <Input
                    name="longitude"
                    type="number"
                    step="any"
                    required
                    defaultValue={
                      record?.longitude ??
                      extractLatLng(record?.link_google_maps || "").lng
                    }
                    placeholder="-39.07"
                  />
                </Field>
                <Field label="Link curto (gerado automaticamente pelo nome)" full>
                  <Input
                    value={record?.link_google_maps_curto || "gerado ao salvar, a partir do nome do ponto histórico"}
                    readOnly
                    disabled
                  />
                </Field>
                <Field full label="">
                  <span className="check-line">
                    <input
                      name="ativo"
                      type="checkbox"
                      defaultChecked={record?.ativo ?? true}
                    />{" "}
                    História ativa e visível no Guia
                  </span>
                </Field>
                <div className="photos-section full">
                  <h3>Fotos</h3>
                  <p className="photos-hint">
                    A capa é a foto que o agente manda de início ao contar essa história; as
                    extras aparecem quando o turista pede mais detalhes.
                  </p>
                  <div className="photo-cover-row">
                    {previewUrl ? (
                      <PhotoPreview
                        src={previewUrl}
                        alt="Foto de capa"
                        cover
                        removable={!!coverFile}
                        onOpen={() => setExpandedImage(previewUrl)}
                        onRemove={() => {
                          setCoverFile(null);
                          setPreviewUrl(record?.foto_capa_url || "");
                        }}
                      />
                    ) : (
                      <div className="photo-cover-empty">Sem foto de capa ainda</div>
                    )}
                  </div>
                  {(photos.length > 0 || extraFiles.length > 0) && (
                    <div className="photo-previews">
                      {photos
                        .filter((photo) => !deletedPhotoIds.includes(photo.id))
                        .map((photo) => (
                          <PhotoPreview
                            key={photo.id}
                            src={photo.url}
                            alt={photo.legenda || "Foto do ponto histórico"}
                            removable
                            onOpen={() => setExpandedImage(photo.url)}
                            onRemove={() =>
                              setDeletedPhotoIds((current) => [...current, photo.id])
                            }
                          />
                        ))}
                      {extraFiles.map((file, index) => {
                        const fileUrl = URL.createObjectURL(file);
                        return (
                          <PhotoPreview
                            key={`${file.name}-${index}`}
                            src={fileUrl}
                            alt={file.name}
                            removable
                            onOpen={() => setExpandedImage(fileUrl)}
                            onRemove={() =>
                              setExtraFiles((current) =>
                                current.filter((_, fileIndex) => fileIndex !== index),
                              )
                            }
                          />
                        );
                      })}
                    </div>
                  )}
                  <div className="photo-pickers">
                    <PhotoPicker
                      label={previewUrl ? "Trocar capa" : "Nova capa"}
                      hint="Essa é a que o agente manda de início ao contar a história"
                      files={coverFile ? [coverFile] : []}
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        setCoverFile(file);
                        if (file) setPreviewUrl(URL.createObjectURL(file));
                      }}
                    />
                    <PhotoPicker
                      label="+ Fotos extras"
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
                </div>
              </>
            )}
            {!isCompany && !isPlace && !isService && !isCityPlace && !isTour && !isHistoria && (
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
              {loading ? "Salvando..." : `Salvar ${PAGE_META[page].singular}`}
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
              alt="Guia Porto"
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </div>
          <strong>Guia Porto</strong>
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
        <img src="/turista-login.png" alt="" className="login-turista" />
      </div>
      <div className="login-form">
        <div className="mobile-brand">
          <div className="brand-mark">
            <img
              src="/logo-guia-porto.png"
              alt="Guia Porto"
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </div>
          <strong>Guia Porto</strong>
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
          © 2026 Guia Porto · Todos os direitos reservados
        </small>
      </div>
    </div>
  );
}
