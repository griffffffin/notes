export default function Spinner(props) {
    return (
        <div className={props.class + " row col align-items-center justify-content-center mx-auto"}>
            {/* A betöltő a téma kiemelőszínét viseli (a spinner-border a
                color-ból veszi a színét), nem a Bootstrap fix szürkéjét — így a
                logóhoz és a gombokhoz illik, és témát vált vele. */}
            <div className="spinner-border text-theme" role="status"/>
        </div>
    );
}
