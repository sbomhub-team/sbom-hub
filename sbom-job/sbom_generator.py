import os
import sys
import subprocess
import shutil
import zipfile

DEFAULT_WORK_DIR = "/workspace/project"
OUTPUT_DIR = "/workspace/output"

def clone_repo(repo_url, work_dir):
    print(f"[INFO] Cloning repository: {repo_url}")
    subprocess.run(["git", "clone", repo_url, work_dir], check=True)

def unzip_file(zip_path, work_dir):
    print(f"[INFO] Unzipping file: {zip_path}")
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(work_dir)

def generate_sbom(work_dir):
    output_file = os.path.join(OUTPUT_DIR, "sbom.json")
    print("[INFO] Generating SBOM with Syft...")
    
    # Open the output file and redirect Syft stdout to it
    with open(output_file, "w") as f:
        subprocess.run([
            "syft",
            work_dir,
            "-o",
            "spdx-json"
        ], stdout=f, check=True)
    
    print(f"[INFO] SBOM saved to {output_file}")

def cleanup(work_dir):
    print("[INFO] Cleaning up workspace...")
    shutil.rmtree(work_dir, ignore_errors=True)

def main():
    if len(sys.argv) < 3:
        print("Usage:")
        print("  python sbom_generator.py --repo <git_url>")
        print("  python sbom_generator.py --zip <zip_path>")
        print("  python sbom_generator.py --path <directory>")
        sys.exit(1)

    work_dir = DEFAULT_WORK_DIR
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    arg_type = sys.argv[1]
    arg_value = sys.argv[2]
    cleanup_enabled = True

    if arg_type == "--repo":
        os.makedirs(work_dir, exist_ok=True)
        clone_repo(arg_value, work_dir)
    elif arg_type == "--zip":
        os.makedirs(work_dir, exist_ok=True)
        unzip_file(arg_value, work_dir)
    elif arg_type == "--path":
        # Use the provided directory directly
        if not os.path.isdir(arg_value):
            print("[ERROR] Path does not exist or is not a directory")
            sys.exit(1)

        work_dir = arg_value
        cleanup_enabled = False
    else:
        print("[ERROR] Invalid argument")
        sys.exit(1)

    try:
        generate_sbom(work_dir)
    finally:
        if cleanup_enabled:
            cleanup(work_dir)

if __name__ == "__main__":
    main()
