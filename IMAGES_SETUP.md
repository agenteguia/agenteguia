# Como Aplicar Suas Logos no Agente Guia

## Estrutura Atual

O projeto foi atualizado com:
- ✅ Nova paleta de cores (#0066cc e #00b8d4)
- ✅ Favicon SVG temporário em `public/favicon.svg`
- ✅ Estrutura pronta em `public/images/`
- ✅ Logos integradas no sidebar e tela de login

## Próximas Etapas: Substituir Imagens

### Opção 1: Remover Fundo Branco (Recomendado)

Você tem um script Python pronto para processar as imagens:

```bash
python3 process-images.py seu-logo.png
```

Este script irá:
1. Remover o fundo branco
2. Criar versão com transparência em `public/images/logo-transparent.png`
3. Gerar favicons em vários tamanhos:
   - 16x16px
   - 32x32px
   - 192x192px
   - 512x512px

**Pré-requisitos:** Python 3 com PIL/Pillow instalado
```bash
pip install Pillow
```

### Opção 2: Usar Online

Se o script não funcionar, use ferramentas online:
- [Remove.bg](https://www.remove.bg/) - Remove fundo automaticamente
- [Online Convert](https://image.online-convert.com/) - Converte para PNG
- [favicon.io](https://favicon.io/) - Gera favicons de imagens PNG

**Passos:**
1. Upload sua logo em Remove.bg
2. Download como PNG (com fundo transparente)
3. Renomeie para `logo-transparent.png`
4. Coloque em `public/images/`
5. Use favicon.io para criar os diferentes tamanhos

### Opção 3: Manual com GIMP ou Photoshop

1. Abra a imagem
2. Selecione o fundo branco (Select > By Color)
3. Exporte como PNG (certifique-se de manter a transparência)
4. Redimensione para os tamanhos necessários

## Estrutura de Arquivos

Após processar as imagens, você terá:

```
public/
├── favicon.svg                    (ícone SVG - atual)
├── images/
│   ├── logo-transparent.png      (logo com fundo transparente)
│   ├── favicon-16x16.png         (favicon pequeno)
│   ├── favicon-32x32.png         (favicon médio)
│   ├── favicon-192x192.png       (ícone para PWA)
│   └── favicon-512x512.png       (ícone grande)
├── favicon-*.png                 (links simbólicos, opcionais)
└── manifest.webmanifest          (já configurado)
```

## Atualizar Arquivos Referenciadores

O projeto já está configurado para usar as imagens nos seguintes lugares:

### 1. `index.html`
- Favicon SVG
- Favicon PNG em vários tamanhos
- Apple touch icon

### 2. `public/manifest.webmanifest`
- Ícones PWA
- Cores da marca (#0066cc)

### 3. `src/App.jsx`
- Logo no sidebar
- Logo na tela de login
- Logo mobile

Todos já estão apontando para `/favicon.svg` ou `/images/favicon-*.png`

## Cores da Marca Agente Guia

```
Azul Primário:  #0066cc (RGB: 0, 102, 204)
Teal/Cyan:      #00b8d4 (RGB: 0, 184, 212)
Branco:         #ffffff
```

Estas cores já foram aplicadas em:
- Sidebar
- Botões
- Links
- Inputs
- Tema da app

## Suporte

Se tiver dúvidas ou problemas:
1. Verifique se a imagem está em PNG
2. Certifique-se que o fundo é branco puro (#ffffff)
3. Tente novamente com o script ou ferramentas online
4. Teste em diferentes navegadores

## Próximos Passos Opcionais

- [ ] Adicionar screenshot do app em `public/screenshot.png`
- [ ] Criar versão dark do logo
- [ ] Adicionar maskable icon para PWA
- [ ] Criar social media preview image

---

**Versão:** 1.0  
**Data:** 2026-08-12  
**Projeto:** Agente Guia - Painel de Gestão
