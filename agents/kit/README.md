# agent-kit 2

Wariant `main`: Claude w czacie VS Code jako koordynator. Codex jest głównym wykonawcą; Copilot, Cursor i OpenCode wykonują równoległe pakiety. Wariant z Codexem jako koordynatorem znajduje się na branchu `codex-coordinator`.

Jedna zaakceptowana misja zawiera kolejkę główną i zapasową na około 1–2 godziny. Runner działa niezależnie od tury czatu, uruchamia kolejne pakiety, przekazuje pracę po limitach i zleca poprawki. Domyślnie dostępne są dwa procesy wykonawcze Codexa, dodatkowo do czatu koordynatora. Nie ma limitów 150/500 linii ani sztucznego przedłużania zadań.

## Pełny autopilot

Profil `full-control` jest jawnym wyborem podczas inicjalizacji. Wykonawcy mają pełne uprawnienia CLI, pracują bez pytań i zatwierdzeń. Prompty definiują zakres, własność plików i zakaz scalania/pushowania; pełny dostęp nie stanowi technicznej izolacji. `doctor --probe` sprawdza rzeczywisty zapis, komendę i commit, zamiast zakładać, że flagi zadziałały.

Koordynator pozostaje w GUI; wykonawcy są osobnymi procesami CLI. Uprawnienia wtyczki nie zastępują konfiguracji runnera. Claude jako wykonawca CLI jest opcjonalny i musi przejść tę samą próbę co pozostałe narzędzia.

## Pierwszy start na Windows

Wymagane: Windows z PowerShell, Git for Windows z Git Bash, Node.js 22+ z npm, VS Code i wtyczka koordynatora. Kod runnera nie wymaga dodatkowych paczek npm.

Jeśli brakuje Git lub Node.js, zainstaluj je, a następnie otwórz nowy terminal:

```powershell
winget install --exact --id Git.Git
winget install --exact --id OpenJS.NodeJS.LTS
git --version
bash --version
node --version
npm --version
```

Pobierz właściwy wariant poza repozytorium projektu. Nie kopiuj jego katalogu `.git` do swojego projektu:

```powershell
git clone --branch main --single-branch https://github.com/BrainAlaw/agent-kit.git "$env:LOCALAPPDATA\agent-kit-main"
$kitSource = Join-Path $env:LOCALAPPDATA 'agent-kit-main'
Set-Location 'D:\path\to\your-project'
& "$kitSource\scripts\setup.ps1" -Project (Get-Location).Path -Tools 'codex,copilot,opencode' -Install
```

`-Install` instaluje CLI wybranego zestawu przez npm. Cursor wymaga instalatora producenta: [Cursor Agent](https://cursor.com/docs/cli/installation). Po instalacji dodaj go przez ponowne wywołanie setup z `-Tools 'codex,copilot,cursor,opencode'`. Pole `command` w lokalnej konfiguracji wskazuje jego rzeczywisty plik wykonywalny. Nie jest wymagane, aby wszystkie opcjonalne narzędzia były zainstalowane.

Zaloguj wybrane narzędzia; logowanie jest jednorazową czynnością interaktywną, której kit nie może wykonać za Ciebie:

```powershell
codex login
copilot login
opencode auth login
opencode models
```

Dla OpenCode ustaw dostępny `provider/model` w polu `model` jego wykonawcy w `agents/kit/project.json`. Nie zakładamy dostępności konkretnego darmowego modelu. Alternatywnie przekaż `-OpenCodeModel 'provider/model'` do setup. Claude wtyczka wymaga własnego zalogowania; jeśli wybierasz też jego CLI, dodaj `claude` do `-Tools` i wykonaj `claude auth login`.

Sprawdź tożsamość Git (`git config user.name`, `git config user.email`) i uruchom:

```powershell
node agents/kit/scripts/runner.mjs doctor --probe
```

Próby korzystają z limitów wybranych kont, działają w tymczasowych repozytoriach i mają timeout 3 minuty na narzędzie. Doctor podaje wersję, brakujące flagi, gotowość i wynik próby. Usuń niedostępne narzędzia z lokalnego `project.json` albo napraw wskazaną przyczynę, po czym ponów próbę. Nie uruchamiaj misji przy nieudanym preflight.

Otwórz projekt w VS Code. W czacie koordynatora wklej:

Przed inicjalizacją i startem wybierz we wtyczce koordynatora tryb pomijania zgód (`bypassPermissions`). Jeśli lokalna polityka go blokuje, diagnoza ma wskazać ten warunek; profil wykonawcy nie usuwa ograniczeń procesu nadrzędnego.

> Read AGENTS.md, COORDINATOR.md and agents/kit/CLI.md. Inspect this project, fill its actual checks and real-machine requirements in agents/kit/project.json, then plan a substantial mission with TDD, ownership lanes and a reserve queue. Do not start until I accept the mission.

Przejrzyj bootstrap i zapisz go w Git przed pierwszą misją. Setup sam nie commituje ani nie pushuje. Lokalny `project.json`, runtime i logi są ignorowane; instrukcje i skrypty są wersjonowane.

Zainstaluj zależności projektu jego rzeczywistym poleceniem wynikającym z lockfile i dokumentacji. Setup wykrywa istniejące `node_modules` jako współdzielony katalog zależności; zadania zmieniające zależności wymagają osobnej instalacji w swoim worktree.

## Start misji i watcher

Koordynator tworzy kompletny manifest JSON na podstawie `agents/kit/templates/MISSION.example.json`. Przykład jest krótką próbą dokumentacyjną, a nie docelową wielkością misji. Zatwierdź rzeczywisty zakres i commituj manifest, aby checkout był czysty.

```powershell
node agents/kit/scripts/runner.mjs start agents/missions/feature.json
node agents/kit/scripts/runner.mjs watch
```

Alternatywny watcher, łączący misje i stare rundy:

```bash
bash agents/kit/scripts/watch-round.sh
```

Watcher jest tylko do odczytu i działa jak tracker na żywo: dla każdej misji tabela ze statusem, stanem runnera, zużytym budżetem i liczbą zweryfikowanych pakietów, a dla każdego pakietu ścieżka, status, wykonawca, próba, naprawy, postęp checklisty i ostatnia aktywność oraz powód `NEEDS_REVIEW`/`BLOCKED` i limity pul. Odświeża widok w miejscu co 2 s (także w Git Bash/Cygwin, gdzie konsola wygląda jak potok); `--plain` dopisuje widok tylko przy zmianie stanu, do logów. `--json` przywraca surowy strumień; `status` zawsze zwraca JSON. Ctrl+C zamyka watcher, a nie misję. Logi i raport końcowy znajdują się w `.worktrees/agent-kit/<mission>/`. Numeryczne rundy nadal obsługują `status.sh <NN> <agent...>` i `run-agent.sh <NN> <agent>` po aktualizacji konfiguracji.

```powershell
node agents/kit/scripts/runner.mjs status
node agents/kit/scripts/runner.mjs pause feature
node agents/kit/scripts/runner.mjs resume feature
node agents/kit/scripts/runner.mjs stop feature
```

`pause` wstrzymuje nowe przydziały i daje czas na checkpoint; `stop` kończy procesy, zachowując pliki. `resume` jawnie przyznaje nowy budżet czasu temu samemu zaakceptowanemu zakresowi. Po awarii runnera sprawdza istniejące próby i odbiera ich wyniki, zamiast dublować pracę.

## Sprawdzanie, limity i odbiór

- Zmiany zachowania i regresje: RED → GREEN → REFACTOR. Każdy pakiet ma kryteria odbioru i rzeczywiste komendy sprawdzające.
- `DONE` wykonawcy i kod `0` nie wystarczają. Runner sprawdza raport, własność plików i testy; niepowodzenie uruchamia poprawkę. Po dwóch nieudanych cyklach naprawczych wymagana jest decyzja koordynatora.
- Limit blokuje współdzieloną pulę konta. Pracę przejmuje wolne, odpowiednie narzędzie w tym samym worktree z zachowaniem także brudnych zmian. Brak dostępnego zastępcy jest widoczny; Freebuff pozostaje ręczną ostatecznością.
- Nie ma cyklicznego `PONG`. Przy znanym resecie ustaw termin w stanie puli; bez niego obowiązuje 60 minut przerwy i najwyżej jedna próba odzyskania w misji.
- `WAITING_INTEGRATION` oznacza zależność między gałęziami; `WAITING_CAPACITY` brak dostępnego wykonawcy; `NEEDS_REVIEW` wymaga przeglądu. `VERIFIED` oznacza przejście zadeklarowanych sprawdzeń, nie odbiór człowieka.
- Po Twoim odbiorze koordynator scala, sprawdza integrację i naprawia regresje. Push wymaga osobnego polecenia. Testy sprzętu i GUI pozostają niezweryfikowane, dopóki ktoś rzeczywiście ich nie wykona.

## Aktualizacja i Linux/macOS

Pobierz aktualizację kita i ponów setup z tym samym projektem, profilem i zestawem narzędzi. Zarządzane sekcje instrukcji są aktualizowane, a własne reguły poza nimi, konfiguracja kont, `CURRENT_STATE.md` i stare rundy zostają zachowane. Dla starej instalacji bez markerów przejrzyj poprzednie zasady i usuń sprzeczne ograniczenia przed startem. Zmiana koordynatora wymaga świadomej migracji; setup jej nie wykonuje automatycznie.

Na Linux/macOS zainstaluj Git, Bash i Node.js 22+ zgodnie z dystrybucją, następnie:

```bash
node /path/to/agent-kit/scripts/setup.mjs --project /path/to/project --tools codex,copilot,opencode --profile full-control --install
node agents/kit/scripts/runner.mjs doctor --probe
node agents/kit/scripts/runner.mjs watch
```

Szczegółowy kontrakt i diagnoza: [CLI.md](CLI.md). Instrukcja bootstrapu dla koordynatora: [BOOTSTRAP.md](BOOTSTRAP.md). Weryfikacja samego kita: `npm test`, `npm run check`. Rzeczywiste wsparcie platform i dostawców potwierdza się osobnymi próbami, nie samymi testami z atrapami.
