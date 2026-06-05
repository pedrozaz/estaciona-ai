# ==============================================================================
# Copyright (C) 2026 Guilherme Pedroza
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.
# ==============================================================================

import os

import sys
import bpy

print("\n=== INICIANDO SCRIPT DE DECIMAÇÃO E EXPORTAÇÃO GLB ===")

# 1. Identifica o arquivo .blend atual aberto
blend_file = bpy.data.filepath
if not blend_file:
    print("ERRO: Este script deve ser executado abrindo um arquivo .blend diretamente!")
    print("Use: blender nome_do_arquivo.blend --background --python export_optimized.py")
    sys.exit(1)

print(f"Arquivo carregado: {os.path.basename(blend_file)}")

# 2. Localiza objetos de malha (mesh) na cena
mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']

if not mesh_objects:
    print("ERRO: Nenhuma malha (mesh) encontrada na cena!")
    sys.exit(1)

# 3. Executa a decimação em segundo plano (ultra leve)
proporcao = 0.05 # Reduz para 5% (~560k vértices de 11.2M)

for obj in mesh_objects:
    print(f"\nProcessando objeto: {obj.name}")
    # Define como objeto ativo
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    
    # Adiciona o modificador Decimate
    print(f"- Adicionando modificador Decimate (Ratio: {proporcao*100}%)...")
    decimate_mod = obj.modifiers.new(name="Decimate_Final", type='DECIMATE')
    decimate_mod.ratio = proporcao
    
    # Aplica o modificador na malha para consolidar e liberar RAM
    print("- Aplicando o modificador na malha física...")
    bpy.ops.object.modifier_apply(modifier="Decimate_Final")
    print(f"- Redução concluída! Nova contagem de vértices estimada: {len(obj.data.vertices)}")

# 4. Exporta diretamente para GLB com compressão Draco (super leve!)
output_dir = os.path.dirname(blend_file)
output_file = os.path.join(output_dir, "melhorresultado_otimizado.glb")

print(f"\n4. Exportando para GLB binário com compressão Draco...")
print(f"Destino: {output_file}")

bpy.ops.export_scene.gltf(
    filepath=output_file,
    export_format='GLB',
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,
    export_apply=True,
    export_vertex_color='ACTIVE'
)

print("\n=== PROCESSO CONCLUÍDO COM SUCESSO! ===")
print(f"Arquivo gerado: {os.path.basename(output_file)}")
print("Você já pode fechar o terminal e usar o arquivo .glb otimizado no seu projeto.")
