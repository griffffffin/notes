export default function Spinner(props) {
    return (
        <div className={props.class + " row col align-items-center justify-content-center mx-auto"}>
            <div className="spinner-border text-secondary" role="status"/>
        </div>
    );
}
