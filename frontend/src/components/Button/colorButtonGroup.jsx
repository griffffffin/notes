import ColorButton from "./colorButton";

export default function ColorButtonGroup(props) {
    return (
        <div className="btn-group w-100 my-2" role="group">
            <ColorButton color="primary" onClick={props.onClick}
                         class="mx-1 mx-sm-2 mx-md-3 mx-xxl-4 mb-1 mb-sm-2 px-2 px-sm-0"/>
            <ColorButton color="info" onClick={props.onClick}
                         class="mx-1 mx-sm-2 mx-md-3 mx-xxl-4 mb-1 mb-sm-2 px-2 px-sm-0"/>
            <ColorButton color="secondary" onClick={props.onClick}
                         class="mx-1 mx-sm-2 mx-md-3 mx-xxl-4 mb-1 mb-sm-2 px-2 px-sm-0"/>
            <ColorButton color="danger" onClick={props.onClick}
                         class="mx-1 mx-sm-2 mx-md-3 mx-xxl-4 mb-1 mb-sm-2 px-2 px-sm-0"/>
            <ColorButton color="warning" onClick={props.onClick}
                         class="mx-1 mx-sm-2 mx-md-3 mx-xxl-4 mb-1 mb-sm-2 px-2 px-sm-0"/>
            <ColorButton color="success" onClick={props.onClick}
                         class="mx-1 mx-sm-2 mx-md-3 mx-xxl-4 mb-1 mb-sm-2 px-2 px-sm-0"/>
        </div>
    );
}
