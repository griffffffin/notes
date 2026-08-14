/* A `class` prop neve SZÁNDÉKOSAN nem `className`: a hívók a Bootstrap
   magasság-osztályát adják át vele (`min-vh-75`), és a komponens fűzi hozzá a
   sajátjait. A React `className`-je csak a DOM-elemeken foglalt név, egy saját
   komponens propja bármi lehet — itt a rövidebb alak maradt a régi kódból, és
   nincs okunk elmozdítani. */
type SpinnerProps = {
    class: string;
};

export default function Spinner({class: className}: SpinnerProps) {
    return (
        <div className={className + " row col align-items-center justify-content-center mx-auto"}>
            {/* A betöltő a téma kiemelőszínét viseli (a spinner-border a
                color-ból veszi a színét), nem a Bootstrap fix szürkéjét — így a
                logóhoz és a gombokhoz illik, és témát vált vele. */}
            <div className="spinner-border text-theme" role="status"/>
        </div>
    );
}
