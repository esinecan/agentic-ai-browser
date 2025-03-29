import os
import argparse

def save_files_as_text(src_dir, dest_dir, exclude_dirs):
    if not os.path.exists(dest_dir):
        os.makedirs(dest_dir)

    for root, dirs, files in os.walk(src_dir):
        # Exclude specified directories
        dirs[:] = [d for d in dirs if d not in exclude_dirs]

        # Check if we are in the top-level directory or a subfolder
        if root == src_dir:
            for file in files:
                # Only process files with the desired extensions
                if file.endswith(('.ts', '.java', '.properties', '.xml', '.py', '.md', '.sql')):
                    src_file_path = os.path.join(root, file)
                    dest_file_path = os.path.join(dest_dir, file + '.txt')

                    try:
                        # Try reading the file as text with UTF-8 encoding
                        with open(src_file_path, 'r', encoding='utf-8') as src_file:
                            content = src_file.read()

                        # Write the content to the destination file
                        with open(dest_file_path, 'w', encoding='utf-8') as dest_file:
                            dest_file.write(content)
                    except UnicodeDecodeError:
                        # Skip binary files or files with incompatible encodings
                        print(f"Skipping binary or incompatible file: {src_file_path}")
                    except Exception as e:
                        # Handle other potential errors
                        print(f"Error processing file {src_file_path}: {e}")
        else:
            # Determine the relative path to the subfolder
            relative_folder_path = os.path.relpath(root, src_dir)
            subfolder_file_path = os.path.join(dest_dir, relative_folder_path.split(os.sep)[0] + '.txt')

            with open(subfolder_file_path, 'a', encoding='utf-8') as subfolder_file:
                for file in files:
                    # Only process files with the desired extensions
                    if file.endswith(('.ts', '.java', '.properties', '.xml', '.py', '.md', '.sql')):
                        src_file_path = os.path.join(root, file)
                        relative_file_path = os.path.relpath(src_file_path, src_dir)

                        try:
                            # Try reading the file as text with UTF-8 encoding
                            with open(src_file_path, 'r', encoding='utf-8') as src_file:
                                content = src_file.read()

                            # Write the relative file path, an empty line, and the content to the subfolder file
                            subfolder_file.write(f"{relative_file_path}\n\n")
                            subfolder_file.write(content)
                            subfolder_file.write("\n---\n")
                        except UnicodeDecodeError:
                            # Skip binary files or files with incompatible encodings
                            print(f"Skipping binary or incompatible file: {src_file_path}")
                        except Exception as e:
                            # Handle other potential errors
                            print(f"Error processing file {src_file_path}: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process and save files as text")
    args = parser.parse_args()

    src_directory = os.path.dirname(os.path.abspath(__file__))
    dest_directory = os.path.join(src_directory, "project_as_text")

    exclude_directories = ["target"]
    
    save_files_as_text(src_directory, dest_directory, exclude_directories)