#!/usr/bin/env python3
"""
Script para remover fundo branco das imagens e criar versões transparentes.
Uso: python3 process-images.py <caminho-da-imagem>
"""

from PIL import Image
import sys
import os

def remove_white_background(input_path, output_path):
    """Remove fundo branco de uma imagem e salva com transparência."""
    try:
        # Abrir imagem
        img = Image.open(input_path)
        
        # Converter para RGBA se necessário
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        
        # Obter dados dos pixels
        data = img.getdata()
        
        # Criar lista para novos dados
        new_data = []
        
        # Processar cada pixel
        for item in data:
            # Se é branco (ou muito próximo), fazer transparente
            if item[0] > 240 and item[1] > 240 and item[2] > 240:
                new_data.append((255, 255, 255, 0))  # Transparente
            else:
                new_data.append(item)
        
        # Aplicar novos dados
        img.putdata(new_data)
        
        # Salvar
        img.save(output_path, 'PNG')
        print(f"✓ Imagem processada: {output_path}")
        return True
    except Exception as e:
        print(f"✗ Erro ao processar imagem: {e}")
        return False

def resize_icon(input_path, output_path, size):
    """Redimensiona imagem para tamanho específico."""
    try:
        img = Image.open(input_path)
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        img.thumbnail((size, size), Image.Resampling.LANCZOS)
        
        # Criar imagem com fundo transparente
        new_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        offset = ((size - img.size[0]) // 2, (size - img.size[1]) // 2)
        new_img.paste(img, offset, img)
        
        new_img.save(output_path, 'PNG')
        print(f"✓ Favicon criado ({size}x{size}): {output_path}")
        return True
    except Exception as e:
        print(f"✗ Erro ao criar favicon: {e}")
        return False

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Uso: python3 process-images.py <caminho-da-imagem>")
        print("\nExemplo:")
        print("  python3 process-images.py guia-porto-logo.png")
        sys.exit(1)
    
    input_file = sys.argv[1]
    
    if not os.path.exists(input_file):
        print(f"Erro: Arquivo não encontrado: {input_file}")
        sys.exit(1)
    
    # Criar diretório se não existir
    os.makedirs('public/images', exist_ok=True)
    
    # Processar logo completa
    logo_output = 'public/images/logo-transparent.png'
    if remove_white_background(input_file, logo_output):
        # Criar favicons em diferentes tamanhos
        sizes = [16, 32, 192, 512]
        for size in sizes:
            favicon_path = f'public/images/favicon-{size}x{size}.png'
            resize_icon(logo_output, favicon_path, size)
    
    print("\n✓ Processamento concluído!")
    print("\nArquivos criados em public/images/:")
    print("  - logo-transparent.png")
    print("  - favicon-16x16.png")
    print("  - favicon-32x32.png")
    print("  - favicon-192x192.png")
    print("  - favicon-512x512.png")
