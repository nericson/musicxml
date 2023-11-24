import xml.etree.ElementTree as ET
import os

def set_dynamics_size(file_path, output_path, new_size):
    # Parse the MusicXML file
    tree = ET.parse(file_path)
    root = tree.getroot()

    # Namespace handling for MusicXML
    ns = {'musicxml': 'http://www.musicxml.org/xsd/musicxml.xsd'}

    # Find all dynamics elements and set their size to new_size
    for dynamic in root.findall('.//musicxml:dynamics', ns):
        for element in dynamic:
            # Set font size to new_size
            element.attrib['font-size'] = str(new_size)

    # Save the modified MusicXML file in the output folder
    tree.write(output_path)

def process_all_files(input_folder, output_folder, new_size):
    # Create the output folder if it doesn't exist
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)

    # Process each file in the input folder
    for file_name in os.listdir(input_folder):
        if file_name.endswith('.musicxml'):
            file_path = os.path.join(input_folder, file_name)
            output_path = os.path.join(output_folder, file_name)
            set_dynamics_size(file_path, output_path, new_size)

# Usage
input_folder = 'input'  # Folder with MusicXML files
output_folder = 'output' # Folder for modified MusicXML files
new_size = 24  # Set font size to 24
process_all_files(input_folder, output_folder, new_size)
