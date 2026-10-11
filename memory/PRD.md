# PRD — Brilhantes Imóveis · Gestão de Vendas e Comissões

## Problema original (pt-BR)
Planilhar vendas do mês/ano de uma imobiliária ("Brilhantes Imóveis") com data, valor de
venda, % e valor de comissão, valor de entrada, fluxos a receber (parcelas), corretor que
fez a venda. Acompanhar ranking de vendas, controlar quantas vendas no mês/ano, o que já
entrou e o que falta entrar. Controle datado.

## Decisões do usuário
- Autenticação: **Login com conta Google** (Emergent-managed Google Auth).
- Usuários: **somente o gestor** lança tudo.
- Parcelas: gestor define nº e valores; marca cada uma como "recebida".
- Ranking: por **quantidade** e por **valor total** (alternável).
- Design: padrão (verde esmeralda + dourado, "Luxury Finance"), em pt-BR.

## Arquitetura
- Frontend: React 19 + Tailwind + shadcn/ui + react-query + recharts. Fonte Plus Jakarta Sans/DM Sans/JetBrains Mono.
- Backend: FastAPI (prefixo /api) + MongoDB (motor).
- Auth: sessão via cookie httpOnly (session_token, 7 dias) + fallback Bearer.

## Persona
- Vinícius (gestor da Brilhantes Imóveis) — lança e acompanha todas as vendas e comissões.

## Requisitos centrais (estáticos)
- CRUD de vendas datadas com comissão (% e R$), entrada, parcelamento.
- Baixa de parcelas (recebido/pendente) com data.
- KPIs: total vendido, comissão total, entradas, já entrou, falta entrar, qtd de vendas.
- Filtros por mês e ano; gráfico mensal; ranking de corretores alternável.

## Implementado (2026-10-11)
- Login Google + rota protegida /dashboard; /api/auth/{session,me,logout}.
- Vendas: GET/POST/PUT/DELETE /api/sales (filtros month/year); PATCH parcelas.
- /api/stats, /api/ranking, /api/monthly-series.
- Dashboard completo: KPIs, gráfico de volume mensal, ranking (pódio) alternável,
  tabela de vendas com busca/edição/exclusão, diálogo de cadastro com geração de
  parcelas, diálogo de fluxo a receber com baixa. Tema claro/escuro.
- Seed de 13 vendas demo de 2026 para o gestor.

### Iteração 2 (2026-10-11)
- Troca "Imóvel" → **Loteamento**; campos **Quadra** e **Lote** (opcionais).
- Cliente: nome, número e e-mail (opcionais).
- **Divisão de comissão** configurável (ex.: 60% corretor / 40% imobiliária) com cálculo
  automático; KPIs Comissão Total / Corretor / Imobiliária (8 cards).
- **Importação** de planilha Excel/CSV/PDF (/api/sales/import) com reconhecimento de
  colunas em pt-BR, formatos R$ e datas DD/MM/AAAA, e modelo CSV para download.
- **Cadastro de Corretores** (/api/brokers CRUD): nome de guerra/completo, número, CRECI,
  e-mail e **foto** (opcionais); foto aparece no ranking; ranking enriquecido com
  comissão do corretor; troféu/medalhas no pódio.
- Testes: 23/23 backend + fluxos frontend 100%.

### Iteração 3 (2026-10-11)
- **Bug corrigido:** navegador traduzia o conteúdo (ex.: "GOLDEN VILLE" → "VILA DOURADA").
  Causa: index.html com `lang="en"`. Corrigido para `lang="pt-BR" translate="no"` +
  `<meta name="google" content="notranslate">` + `body.notranslate`. Dados salvos verbatim.
- **Exportar relatório** do período em **Excel (.xlsx)** e **PDF** (/api/export/xlsx, /api/export/pdf)
  com totais e divisão de comissão. Logo no topo do PDF.
- **Anexos por venda** (contratos/comprovantes): upload/listar/baixar/excluir
  (/api/sales/{id}/attachments, /api/attachments/{id}/download). Base64 em coleção própria, máx. 10 MB.
- **Logomarca** aplicada (login, cabeçalho claro/escuro, favicon, PDF). Título da aba = Brilhante's Imóveis.
- Testes: 30/30 backend; UI smoke test de export e anexos OK.

### Iteração 4 (2026-10-11) — Multiusuário / RBAC
- **Master** via Google (viniciusbrilhante03@ e brilhantesimoveis@). **Corretores** via e-mail+senha (JWT),
  senha inicial = CPF, com trocar senha + esqueci/redefinir. Link público /cadastro (self-signup ativo na hora).
- **Isolamento (ownership):** corretor vê só as próprias vendas; vê VGV geral da imobiliária; ranking é geral.
- Master cria venda digitando o nome de guerra do corretor → venda vinculada (owner) a quem vendeu.
- **Loteamentos**: só o master cadastra; autocomplete para todos; corretor só usa os já cadastrados.
- Exclusão de venda vai para **histórico** (sales_history, visível ao master em Equipe › Histórico).
- Equipe (master): lista de corretores + ativar/inativar + link de cadastro + abas Loteamentos/Histórico.
- Testes: 52/52 backend + fluxos frontend 100%.

## Backlog (P1/P2)
- P1: Acesso individual por corretor (login) + previsão de recebimento de comissão por corretor.
- P1: Exportação CSV/PDF dos relatórios.
- P1: Split de comissão por venda na importação (hoje fixo 60/40) + erros por linha no import.
- P2: Filtro de período personalizado (intervalo de datas).
- P2: Metas mensais por corretor; alerta de parcelas vencendo.
- P2: Foto de corretor via object storage (hoje base64 no documento).

## Próximas tarefas sugeridas
- Exportar relatório do período em PDF/CSV.
- Metas mensais e alerta de parcelas vencendo.
