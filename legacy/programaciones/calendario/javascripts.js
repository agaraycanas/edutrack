var ventanaCalendario=false

function muestraCalendario(raiz,formulario_destino,campo_destino,mes_destino,ano_destino){
	//funcion para abrir una ventana con un calendario.
	//Se deben indicar los datos del formulario y campos que se desean editar con el calendario, es decir, los campos donde va la fecha.
	if (typeof ventanaCalendario.document == "object") {
		ventanaCalendario.close()
	}
	ventanaCalendario = window.open("calendario/index.php?formulario=" + formulario_destino + "&nomcampo=" + campo_destino,"calendario","width=300,height=300,left=100,top=100,scrollbars=no,menubars=no,statusbar=NO,status=NO,resizable=YES,location=NO")
}
    function cerrar() {
        window.location="index.php";
    }
    
    function editarComentario(elementoInvocante) {
        var datosAEnviar=new Array();
        datosAEnviar[0]=elementoInvocante.value;
        var resultado= window.showModalDialog(
            "editarComentarios.html",
            datosAEnviar,
            'width=100,height=100,status:no;resizable:no');
        elementoInvocante.value=resultado;
    }
    
    function limpiar(elemento) {
        elemento.value='';
    }
