import {useEffect} from "react";

/* Escape a szerkesztőben = ugyanaz, mint a "Tovább" gomb: a formot sütjük el
   (requestSubmit), így a form saját onSubmit-ja fut le — a mentést/kilépést tehát
   nem kell itt megismételni, egy helyen marad (a szerkesztő handleSubmit-jában).

   Kivétel: ha a törlés-modal nyitva van, az Escape AZT zárja. A natív <dialog>
   magától reagál az Escape-re, ezért itt csak félre kell állnunk — enélkül a modal
   bezárása egyszerre mentene és lépne ki a szerkesztőből.

   A figyelő a WINDOW-on ül (nem a formon): az Escape akkor is működjön, ha a fókusz
   épp nincs a mezőkön (pl. a felhasználó a lapra kattintott). */
export function useEscapeSubmit(formRef) {
    useEffect(() => {
        const onKeyDown = (event) => {
            if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
                formRef.current?.requestSubmit();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [formRef]);
}
