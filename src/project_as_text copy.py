import os
import argparse

def save_files_as_text(src_dir, dest_file_path, exclude_dirs, single_file=False):
    if single_file:
        # Create or open the destination file in append mode
        with open(dest_file_path, 'w', encoding='utf-8') as dest_file:
            for root, dirs, files in os.walk(src_dir):
                # Exclude specified directories
                dirs[:] = [d for d in dirs if d not in exclude_dirs]

                for file in files:
                    # Only process files with the desired extensions
                    if file.endswith(('.ts', '.java', '.properties', '.xml', '.py', '.md', '.sql')):
                        src_file_path = os.path.join(root, file)

                        try:
                            # Try reading the file as text with UTF-8 encoding
                            with open(src_file_path, 'r', encoding='utf-8') as src_file_content:
                                content = src_file_content.read()
                            
                            # Append the content to the destination file
                            dest_file.write(f"{file}.txt\n\n")
                            dest_file.write(content)
                            dest_file.write("\n" + "-" * 20 + "\n")
                        except UnicodeDecodeError:
                            # Skip binary files or files with incompatible encodings
                            print(f"Skipping binary or incompatible file: {src_file_path}")
                        except Exception as e:
                            # Handle other potential errors
                            print(f"Error processing file {src_file_path}: {e}")
    else:
        if not os.path.exists(dest_file_path):
            os.makedirs(dest_file_path)
        
        for root, dirs, files in os.walk(src_dir):
            # Exclude specified directories
            dirs[:] = [d for d in dirs if d not in exclude_dirs]
            
            for file in files:
                # Only process files with the desired extensions
                if file.endswith(('.ts', '.java', '.properties', '.xml', '.py', '.md', '.sql')):
                    src_file_path = os.path.join(root, file)
                    dest_file_path_single = os.path.join(dest_file_path, file + '.txt')

                    try:
                        # Try reading the file as text with UTF-8 encoding
                        with open(src_file_path, 'r', encoding='utf-8') as src_file:
                            content = src_file.read()

                        # Write the content to the destination file
                        with open(dest_file_path_single, 'w', encoding='utf-8') as dest_file_single:
                            dest_file_single.write(content)
                    except UnicodeDecodeError:
                        # Skip binary files or files with incompatible encodings
                        print(f"Skipping binary or incompatible file: {src_file_path}")
                    except Exception as e:
                        # Handle other potential errors
                        print(f"Error processing file {src_file_path}: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process and save files as text")
    parser.add_argument("--single", action="store_true", help="Save all files in a single text file")
    args = parser.parse_args()

    src_directory = os.path.dirname(os.path.abspath(__file__))
    if args.single:
        dest_file = os.path.join(src_directory, "project_as_text.txt")
    else:
        dest_directory = os.path.join(src_directory, "project_as_text")
        dest_file = dest_directory

    exclude_directories = ["target"]
    
    save_files_as_text(src_directory, dest_file, exclude_directories, args.single)
