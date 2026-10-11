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
