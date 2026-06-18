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
import glob
import bpy

print("\n=== SCRIPT DE CONVERSÃO DE OBJ PARA BLEND (OTIMIZADO) ===")

# 1. Encontra automaticamente o arquivo .obj na pasta
reconstruction_dir = os.path.dirname(os.path.abspath(__file__))
obj_files = glob.glob(os.path.join(reconstruction_dir, "*.obj"))

if not obj_files:
    # Procura também no diretório atual de execução
    obj_files = glob.glob("*.obj")

if not obj_files:
    print("ERRO: Nenhum arquivo .obj encontrado na pasta do script!")
    print(
        "Por favor, coloque o arquivo .obj na mesma pasta ou edite o script com o caminho correto."
    )
    sys.exit(1)

# Se houver mais de um, pega o maior (provavelmente o modelo de 1.4GB)
obj_files.sort(key=lambda f: os.path.getsize(f), reverse=True)
input_file = obj_files[0]
filename_base = os.path.splitext(os.path.basename(input_file))[0]
output_file = os.path.join(reconstruction_dir, f"{filename_base}_otimizado.blend")

print(
    f"Modelo encontrado: {os.path.basename(input_file)} ({os.path.getsize(input_file) / (1024 * 1024 * 1024):.2f} GB)"
)
print(f"Arquivo de saída: {os.path.basename(output_file)}")

print("\n1. Importando OBJ (C++ Importer - sem carregar a interface)...")
bpy.ops.wm.obj_import(filepath=input_file)

print("2. Aplicando redução (Decimate) e suavização (Shade Smooth)...")
# Proporção da decimação
proporcao = 0.85

# Aplica a redução em todas as malhas importadas
for obj in bpy.context.scene.objects:
    if obj.type == "MESH":
        bpy.context.view_layer.objects.active = obj

        # Adiciona o modificador Decimate
        decimate_mod = obj.modifiers.new(name="Decimate", type="DECIMATE")
        decimate_mod.ratio = proporcao

        # Aplica o modificador
        bpy.ops.object.modifier_apply(modifier="Decimate")

        # Ativa sombreamento suave para o modelo ficar bonito mesmo com menos polígonos
        bpy.ops.object.shade_smooth()

print(f"3. Salvando arquivo nativo otimizado: {os.path.basename(output_file)}...")
bpy.ops.wm.save_as_mainfile(filepath=output_file)

print("\n=== CONVERSÃO CONCLUÍDA COM SUCESSO! ===")
print(f"Abra o arquivo '{os.path.basename(output_file)}' no Blender para editar.")
