# src/canon — conector do drummond-canon

Branch `canon` do fork `drummondjunior/Backlog.md` (origem: `MrLesk/Backlog.md`, MIT). O Backlog.md inteiro —
servidor, tela, CLI com quadro no terminal, MCP — passa a ler os nós Dewey do canon por uma implementação da
camada de persistência deles. Desenho: `docs/superpowers/specs/2026-09-18-backlog-connector-design.md` no repo do
drummond-canon (nó `1.34.10`).

## Regra do branch

O código novo mora **só** em `src/canon/`. Fora dele, o patch se limita aos pontos de encaixe do desenho §3, cada um
marcado com o comentário `// drummond-canon`:

- identidade e ordem do nó — `src/utils/prefix-config.ts`, `src/utils/task-id.ts`, `src/utils/task-sorting.ts`;
- formato do nó — `src/markdown/parser.ts` (`parseTask`);
- onde e como ler — `src/core/backlog.ts` (as duas linhas que criam o `FileSystem`).

Qualquer outro ponto tocado é defeito: vira nó no canon antes do commit.

## Atualizar a partir do upstream

```bash
git fetch upstream
git merge upstream/main          # no branch canon
bun install && bun test          # comparar com a linha de base abaixo
```

## Linha de base (antes de qualquer mudança nossa)

Commit `26c897d4` do upstream, bun 1.3.10, `bun test`: **2865 pass, 8 skip, 27 fail, 1 error** em 2900 testes de
290 arquivos (368 s). As 27 falhas e o erro já vêm do upstream; o conector se mede contra estes números.
