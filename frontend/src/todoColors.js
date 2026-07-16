/* A to-do kártyák színpalettája: NÉV → hex.

   A név a Bootstrap-osztályokba kerül ("border-" + color), a hexet a sorszám
   tooltipjének kerete kéri. Korábban a kettő két külön helyen élt: a nevek a
   ColorButtonGroup JSX-ében felsorolva, a hexek a Save egyik switch-ében —
   egy új szín felvétele tehát két fájl összehangolt szerkesztését kívánta,
   és semmi nem jelezte volna, ha az egyik kimarad.

   A kulcsok sorrendje egyben a színválasztó gombok sorrendje. */
export const TODO_COLORS = {
    primary: "#0d6efd",
    info: "#0dcaf0",
    secondary: "#6c757d",
    danger: "#dc3545",
    warning: "#ffc107",
    success: "#198754",
};
