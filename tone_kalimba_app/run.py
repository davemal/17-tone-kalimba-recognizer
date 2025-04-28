import subprocess
import sys
import os
import platform

VENV_DIR = ".venv" 

def get_venv_python_executable(venv_dir):
    """
    Vrátí cestu ke spustitelnému souboru 'python' uvnitř virtuálního prostředí,
    s ohledem na různé operační systémy (Windows vs. ostatní).
    """
    if platform.system() == "Windows":
        return os.path.join(venv_dir, "Scripts", "python.exe")
    else: # Linux, macOS atd.
        return os.path.join(venv_dir, "bin", "python")

def create_venv(venv_dir):
    """
    Vytvoří virtuální prostředí, pokud neexistuje.
    """
    if os.path.exists(venv_dir):
        print(f"Virtuální prostředí '{venv_dir}' již existuje. Přeskakuji vytváření.")
    else:
        print(f"Vytvářím virtuální prostředí '{venv_dir}'...")
        try:
            # Spustí příkaz 'python -m venv .venv' pomocí aktuálního interpretera,
            # který spustil tento skript.
            subprocess.run([sys.executable, "-m", "venv", venv_dir], check=True)
            print(f"Virtuální prostředí '{venv_dir}' úspěšně vytvořeno.")
        except FileExistsError:
             print(f"Adresář virtuálního prostředí '{venv_dir}' již existuje.")
        except subprocess.CalledProcessError as e:
            print(f"Chyba při vytváření virtuálního prostředí: {e}")
            print("Prosím zkontrolujte, zda máte nainstalovaný modul 'venv' (je součástí standardní knihovny od Pythonu 3.3).")
            sys.exit(1)
        except Exception as e:
            print(f"Došlo k neočekávané chybě při vytváření venv: {e}")
            sys.exit(1)

def install_requirements(requirements_file="requirements.txt", venv_dir=VENV_DIR):
    """
    Instaluje balíčky uvedené v requirements_file do virtuálního prostředí.
    """
    print(f"Kontroluji a instaluji potřebné balíčky z '{requirements_file}' do virtuálního prostředí '{venv_dir}'...")

    # Získáme cestu k pythonu uvnitř venv
    venv_python = get_venv_python_executable(venv_dir)

    # Rychlá kontrola, zda python ve venv existuje
    if not os.path.exists(venv_python):
         print(f"Chyba: Spustitelný soubor python nebyl nalezen ve '{venv_dir}'. Vytvoření venv možná selhalo nebo je adresář poškozen.")
         sys.exit(1)

    if not os.path.exists(requirements_file):
        print(f"Upozornění: Soubor '{requirements_file}' nebyl nalezen ve stejném adresáři jako run.py.")
        print("Přeskakuji instalaci balíčků.")
        return

    try:
        # Spustí pip install pomocí pythonu z virtuálního prostředí
        subprocess.run([venv_python, "-m", "pip", "install", "-r", requirements_file], check=True)
        print("Balíčky úspěšně nainstalovány nebo již existují ve virtuálním prostředí.")
    except FileNotFoundError:
        print(f"Chyba: Spustitelný soubor pip nebo python nebyl nalezen v {venv_dir}. Zkuste smazat adresář '{venv_dir}' a spustit znovu.")
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        print(f"Chyba při instalaci balíčků do virtuálního prostředí: {e}")
        print("Prosím zkontrolujte obsah requirements.txt a připojení k internetu.")
        sys.exit(1)
    except Exception as e:
        print(f"Došlo k neočekávané chybě při instalaci do venv: {e}")
        sys.exit(1)

def run_application(app_file="app.py", venv_dir=VENV_DIR):
    """
    Spustí hlavní aplikační soubor app_file pomocí pythonu z virtuálního prostředí.
    """
    print(f"Spouštím aplikaci '{app_file}' pomocí pythonu z virtuálního prostředí '{venv_dir}'...")

    # Získáme cestu ke pythonu uvnitř venv
    venv_python = get_venv_python_executable(venv_dir)

    # Rychlá kontrola, zda python ve venv existuje
    if not os.path.exists(venv_python):
         print(f"Chyba: Spustitelný soubor python nebyl nalezen ve '{venv_dir}'. Vytvoření venv možná selhalo.")
         sys.exit(1)


    if not os.path.exists(app_file):
        print(f"Chyba: Soubor aplikace '{app_file}' nebyl nalezen ve stejném adresáři jako run.py.")
        print("Ujistěte se, že app.py existuje a je vedle run.py.")
        sys.exit(1) # app.py musí existovat pro spuštění

    try:
        # Spustí app.py pomocí pythonu z virtuálního prostředí
        subprocess.run([venv_python, app_file], check=True)
        print(f"Spuštění aplikace '{app_file}' dokončeno.")
    except FileNotFoundError:
         # Tato chyba by naznačovala problém s cestou k pythonu ve venv
        print(f"Chyba: Spustitelný soubor python z '{venv_dir}' nebyl nalezen. Zkuste smazat adresář '{venv_dir}' a spustit znovu.")
        sys.exit(1)
    except subprocess.CalledProcessError as e:
         print(f"Aplikace '{app_file}' selhala.")
         print(f"Proces skončil s návratovým kódem {e.returncode}")
         if e.stderr:
              try:
                  print(f"Výstup chyby (stderr):\n{e.stderr.decode()}")
              except Exception:
                  print("Nelze dekódovat výstup chyby z aplikace.")

         sys.exit(1) # Ukončíme skript s chybovým kódem
    except Exception as e:
        print(f"Došlo k neočekávané chybě při spouštění aplikace '{app_file}': {e}")
        sys.exit(1) # Ukončíme skript s chybovým kódem

if __name__ == "__main__":
    # Hlavní logika skriptu
    create_venv(VENV_DIR) # 1. Vytvoří venv, pokud neexistuje
    print("-" * 40)
    install_requirements(venv_dir=VENV_DIR) # 2. Nainstaluje požadavky do venv
    print("-" * 40)
    run_application(venv_dir=VENV_DIR)  # 3. Spustí app.py pomocí pythonu z venv