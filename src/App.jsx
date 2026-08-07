import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase.js';

const nav = [['Empresas', '▦'], ['Locais', '⌖'], ['Categorias', '◇']];
const emptyData = { categorias: [], empresas: [], locais: [] };

function Field({ label, children, full = false }) { return <label className={full ? 'field full' : 'field'}><span>{label}</span>{children}</label>; }
function Input(props) { return <input {...props} />; }
function Stat({ value, label }) { return <div className="stat"><b>{value}</b><span>{label}</span></div>; }
function Status({ value }) { const labels = { ativo: 'Ativa', pendente_aprovacao: 'Pendente', inadimplente: 'Inadimplente', recusado: 'Recusada', inativo: 'Inativo' }; return <span className={`status ${value}`}>{labels[value] || value}</span>; }

export default function App() {
  const [session, setSession] = useState(null);
  const [data, setData] = useState(emptyData);
  const [page, setPage] = useState('Empresas');
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);

  const showNotice = (message, type = 'success') => { setNotice({ message, type }); window.setTimeout(() => setNotice(null), 4200); };
  const loadData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [categorias, empresas, locais] = await Promise.all([
      supabase.from('categorias').select('*').order('ordem', { ascending: true }),
      supabase.from('empresas').select('*, categoria:categorias(nome)').order('criado_em', { ascending: false }),
      supabase.from('locais').select('*, categoria:categorias(nome), empresa:empresas(nome_fantasia)').order('nome', { ascending: true }),
    ]);
    const error = categorias.error || empresas.error || locais.error;
    if (error) showNotice(`Não foi possível carregar os dados: ${error.message}`, 'error');
    else setData({ categorias: categorias.data || [], empresas: empresas.data || [], locais: locais.data || [] });
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => { if (session) loadData(); }, [session, loadData]);

  const rows = useMemo(() => {
    const list = page === 'Empresas' ? data.empresas : page === 'Locais' ? data.locais : data.categorias;
    return list.filter((item) => Object.values(item).join(' ').toLowerCase().includes(search.toLowerCase()));
  }, [data, page, search]);
  const titles = { Empresas: ['Empresas', 'Gerencie os parceiros e negócios da plataforma.'], Locais: ['Locais', 'Organize os lugares que o Agente Guia recomenda.'], Categorias: ['Categorias', 'Defina como os locais são agrupados no aplicativo.'] };

  async function saveRecord(values) {
    if (!supabase) return showNotice('Configure as credenciais do Supabase no arquivo .env.', 'error');
    setLoading(true);
    let table; let payload;
    if (page === 'Empresas') {
      table = 'empresas'; payload = { nome_fantasia: values.nome_fantasia, cnpj: values.cnpj || null, categoria_id: values.categoria_id, responsavel_nome: values.responsavel_nome, telefone: values.telefone, email: values.email, status: values.status };
      if (!editingRecord) payload.criado_em = new Date().toISOString();
    } else if (page === 'Locais') {
      table = 'locais'; payload = { categoria_id: values.categoria_id, empresa_id: values.empresa_id || null, nome: values.nome, descricao: values.descricao || null, historia: values.historia || null, endereco: values.endereco || null, latitude: values.latitude ? Number(values.latitude) : null, longitude: values.longitude ? Number(values.longitude) : null, faixa_preco: values.faixa_preco || null, telefone: values.telefone || null, instagram: values.instagram || null, horario_funcionamento: values.horario_funcionamento || null, ativo: values.ativo === 'on' };
    } else {
      table = 'categorias'; payload = { nome: values.nome, icone: values.icone || null, ordem: Number(values.ordem) || 0 };
    }
    const result = editingRecord ? await supabase.from(table).update(payload).eq('id', editingRecord.id) : await supabase.from(table).insert(payload);
    setLoading(false);
    if (result.error) return showNotice(`Não foi possível salvar: ${result.error.message}`, 'error');
    setModal(false); setEditingRecord(null); showNotice(`${page.slice(0, -1)} ${editingRecord ? 'atualizado' : 'salvo'} com sucesso.`); await loadData();
  }
  if (!session) return <Login onError={(message) => showNotice(message, 'error')} />;
  const [title, subtitle] = titles[page];
  const activeCompanies = data.empresas.filter((x) => x.status === 'ativo').length;
  const pendingCompanies = data.empresas.filter((x) => x.status === 'pendente_aprovacao').length;
  const activePlaces = data.locais.filter((x) => x.ativo).length;
  const publicPlaces = data.locais.filter((x) => !x.empresa_id).length;
  return <div className="app-shell">
    <aside className={menuOpen ? 'sidebar open' : 'sidebar'}><div className="brand"><div className="brand-mark">✦</div><div><strong>Agente Guia</strong><small>Painel de gestão</small></div><button className="close" onClick={() => setMenuOpen(false)}>×</button></div><nav>{nav.map(([name, icon]) => <button className={page === name ? 'nav-item active' : 'nav-item'} key={name} onClick={() => { setPage(name); setMenuOpen(false); setSearch(''); }}><i>{icon}</i>{name}</button>)}</nav><div className="sidebar-bottom"><div className="profile"><div className="avatar">VG</div><div><b>{session.user.email?.split('@')[0] || 'Administrador'}</b><small>Administrador</small></div></div><button className="logout" onClick={() => supabase.auth.signOut()}>↪ Sair</button></div></aside>
    <main><header><button className="menu-button" onClick={() => setMenuOpen(true)}>☰</button><div className="crumb">Gestão <span>/</span> {page}</div><div className="header-actions"><button className="help">?</button><button className="avatar">VG</button></div></header><section className="content"><div className="title-row"><div><h1>{title}</h1><p>{subtitle}</p></div><button className="primary" onClick={() => { setEditingRecord(null); setModal(true); }}>＋ Nova {page.slice(0, -1)}</button></div>
      <div className="stats">{page === 'Empresas' && <><Stat value={data.empresas.length} label="Empresas cadastradas"/><Stat value={activeCompanies} label="Empresas ativas"/><Stat value={pendingCompanies} label="Aguardando aprovação"/></>}{page === 'Locais' && <><Stat value={data.locais.length} label="Locais cadastrados"/><Stat value={activePlaces} label="Locais ativos"/><Stat value={publicPlaces} label="Pontos públicos"/></>}{page === 'Categorias' && <><Stat value={data.categorias.length} label="Categorias"/><Stat value={data.locais.length} label="Locais organizados"/></>}</div>
      <section className="panel"><div className="panel-top"><div className="search"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Buscar ${page.toLowerCase()}...`} /></div><button className="filter">☷ <span>Filtros</span></button></div><DataTable page={page} rows={rows} loading={loading} onEdit={(record) => { setEditingRecord(record); setModal(true); }} /></section>
    </section></main>
    {modal && <Editor page={page} categories={data.categorias} companies={data.empresas} loading={loading} record={editingRecord} close={() => { setModal(false); setEditingRecord(null); }} save={saveRecord} />}
    {notice && <div className={`toast ${notice.type === 'error' ? 'toast-error' : ''}`}>{notice.type === 'error' ? '!' : '✓'} {notice.message}</div>}
  </div>;
}

function DataTable({ page, rows, loading, onEdit }) {
  if (page === 'Categorias') return rows.length ? <div className="category-grid">{rows.map((x) => <article className="category-card" key={x.id}><div className="category-icon">{x.icone || '◇'}</div><div><b>{x.nome}</b><p>Ordem de exibição: {x.ordem}</p></div><button onClick={() => onEdit(x)}>•••</button></article>)}</div> : <div className="empty">{loading ? 'Carregando dados...' : 'Ainda não há categorias cadastradas.'}</div>;
  const company = page === 'Empresas';
  return <div className="table-wrap"><table><thead><tr>{(company ? ['Empresa', 'Categoria', 'Responsável', 'Contato', 'Status', ''] : ['Local', 'Categoria', 'Vinculado a', 'Endereço', 'Status', '']).map((x) => <th key={x}>{x}</th>)}</tr></thead><tbody>{rows.map((x) => <tr key={x.id}><td><b>{x.nome_fantasia || x.nome}</b>{company && <small>{x.cnpj}</small>}</td><td><span className="pill">{x.categoria?.nome || 'Sem categoria'}</span></td><td>{company ? x.responsavel_nome : x.empresa?.nome_fantasia || 'Ponto público'}</td><td>{company ? x.telefone : x.endereco}</td><td>{company ? <Status value={x.status} /> : <Status value={x.ativo ? 'ativo' : 'inativo'} />}</td><td><button className="more" onClick={() => onEdit(x)}>•••</button></td></tr>)}</tbody></table>{!rows.length && <div className="empty">{loading ? 'Carregando dados...' : 'Nenhum resultado encontrado.'}</div>}</div>;
}

function Editor({ page, categories, companies, record, close, save, loading }) {
  const isCompany = page === 'Empresas', isPlace = page === 'Locais';
  const submit = (event) => { event.preventDefault(); save(Object.fromEntries(new FormData(event.currentTarget))); };
  return <div className="modal-layer"><form className="modal" onSubmit={submit}><div className="modal-header"><div><h2>{record ? 'Editar' : 'Nova'} {page.slice(0, -1)}</h2><p>{record ? 'Atualize os dados abaixo.' : 'Preencha os dados abaixo para cadastrar.'}</p></div><button type="button" onClick={close}>×</button></div><div className="form-grid">
    {isCompany && <><Field label="Nome fantasia"><Input name="nome_fantasia" defaultValue={record?.nome_fantasia || ''} required placeholder="Ex.: Bistrô do Porto" /></Field><Field label="CNPJ (opcional)"><Input name="cnpj" defaultValue={record?.cnpj || ''} placeholder="00.000.000/0000-00" /></Field><Field label="Categoria"><select name="categoria_id" required defaultValue={record?.categoria_id || ''}><option value="" disabled>Selecione uma categoria</option>{categories.map(x => <option value={x.id} key={x.id}>{x.nome}</option>)}</select></Field><Field label="Status"><select name="status" defaultValue={record?.status || 'pendente_aprovacao'}><option value="pendente_aprovacao">Pendente de aprovação</option><option value="ativo">Ativo</option><option value="inadimplente">Inadimplente</option><option value="recusado">Recusado</option></select></Field><Field label="Nome do responsável"><Input name="responsavel_nome" defaultValue={record?.responsavel_nome || ''} required placeholder="Nome completo" /></Field><Field label="Telefone"><Input name="telefone" defaultValue={record?.telefone || ''} required placeholder="(00) 00000-0000" /></Field><Field label="E-mail" full><Input name="email" type="email" defaultValue={record?.email || ''} required placeholder="contato@empresa.com" /></Field></>}
    {isPlace && <><Field label="Nome"><Input name="nome" defaultValue={record?.nome || ''} required placeholder="Nome do local" /></Field><Field label="Categoria"><select name="categoria_id" required defaultValue={record?.categoria_id || ''}><option value="" disabled>Selecione uma categoria</option>{categories.map(x => <option value={x.id} key={x.id}>{x.nome}</option>)}</select></Field><Field label="Empresa vinculada"><select name="empresa_id" defaultValue={record?.empresa_id || ''}><option value="">Ponto público (sem empresa)</option>{companies.map(x => <option value={x.id} key={x.id}>{x.nome_fantasia}</option>)}</select></Field><Field label="Faixa de preço"><select name="faixa_preco" defaultValue={record?.faixa_preco || ''}><option value="">Não informado</option><option value="$">$</option><option value="$$">$$</option><option value="$$$">$$$</option></select></Field><Field label="Descrição" full><textarea name="descricao" defaultValue={record?.descricao || ''} placeholder="O que é este lugar?" /></Field><Field label="História e curiosidades" full><textarea name="historia" defaultValue={record?.historia || ''} placeholder="Informações que o agente contará ao recomendar" /></Field><Field label="Endereço" full><Input name="endereco" defaultValue={record?.endereco || ''} placeholder="Rua, número, bairro" /></Field><Field label="Latitude"><Input name="latitude" type="number" step="any" defaultValue={record?.latitude ?? ''} placeholder="-3.71722" /></Field><Field label="Longitude"><Input name="longitude" type="number" step="any" defaultValue={record?.longitude ?? ''} placeholder="-38.54306" /></Field><Field label="Telefone"><Input name="telefone" defaultValue={record?.telefone || ''} placeholder="(00) 00000-0000" /></Field><Field label="Instagram"><Input name="instagram" defaultValue={record?.instagram || ''} placeholder="@perfil" /></Field><Field label="Horário de funcionamento" full><Input name="horario_funcionamento" defaultValue={record?.horario_funcionamento || ''} placeholder="Segunda a sábado, 9h às 18h" /></Field><Field full label=""><span className="check-line"><input name="ativo" type="checkbox" defaultChecked={record?.ativo ?? true} /> Local ativo e visível no Guia</span></Field></>}
    {!isCompany && !isPlace && <><Field label="Nome"><Input name="nome" defaultValue={record?.nome || ''} required placeholder="Ex.: Restaurantes" /></Field><Field label="Ícone"><Input name="icone" defaultValue={record?.icone || ''} placeholder="Emoji ou nome do ícone" /></Field><Field label="Ordem de exibição"><Input name="ordem" type="number" required defaultValue={record?.ordem ?? 0} /></Field></>}
  </div><div className="modal-actions"><button type="button" className="secondary" onClick={close}>Cancelar</button><button className="primary" disabled={loading}>{loading ? 'Salvando...' : `Salvar ${page.slice(0, -1)}`}</button></div></form></div>;
}

function Login({ onError }) {
  const [loading, setLoading] = useState(false);
  const submit = async (event) => { event.preventDefault(); if (!supabase) return onError('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env.'); const values = Object.fromEntries(new FormData(event.currentTarget)); setLoading(true); const { error } = await supabase.auth.signInWithPassword({ email: values.email, password: values.password }); setLoading(false); if (error) onError(`Não foi possível entrar: ${error.message}`); };
  return <div className="login"><div className="login-art"><div className="login-brand"><div className="brand-mark">✦</div><strong>Agente Guia</strong></div><div className="art-copy"><span>PLATAFORMA DE GESTÃO</span><h1>Seu destino,<br/><em>mais inteligente.</em></h1><p>Organize empresas, locais e experiências para tornar cada recomendação memorável.</p></div><div className="orb orb-one"/><div className="orb orb-two"/></div><div className="login-form"><div className="mobile-brand"><div className="brand-mark">✦</div><strong>Agente Guia</strong></div><form onSubmit={submit}><div className="eyebrow">BEM-VINDO DE VOLTA</div><h2>Acesse sua conta</h2><p>Entre com suas credenciais para gerenciar o guia.</p><Field label="E-mail"><Input name="email" type="email" defaultValue={record?.email || ''} required placeholder="voce@empresa.com" /></Field><Field label="Senha"><div className="password"><Input name="password" type="password" required placeholder="Sua senha" /></div></Field><div className="login-options"><label><input type="checkbox" /> Lembrar de mim</label><a href="#">Esqueci minha senha</a></div><button className="primary login-submit" disabled={loading}>{loading ? 'Entrando...' : 'Entrar na plataforma →'}</button></form><small className="copyright">© 2026 Agente Guia · Todos os direitos reservados</small></div></div>;
}