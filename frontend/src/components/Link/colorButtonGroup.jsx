import LinkColorButton from "./colorButton";

export default function ColorButtonGroup(props) {
    return (
        <div className="pt-2 pb-2 pe-1">
            <LinkColorButton color="success" onClick={props.onClick}/>
            <LinkColorButton color="warning" onClick={props.onClick}/>
            <LinkColorButton color="danger" onClick={props.onClick}/>
            <LinkColorButton color="secondary" onClick={props.onClick}/>
            <LinkColorButton color="info" onClick={props.onClick}/>
            <LinkColorButton color="primary" onClick={props.onClick}/>
        </div>
    );
}
