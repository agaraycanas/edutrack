<?php
function calcula_numero_dia_semana($dia,$mes,$ano){
	$numerodiasemana = date('w', mktime(0,0,0,$mes,$dia,$ano));
	if ($numerodiasemana == 0) 
		$numerodiasemana = 6;
	else
		$numerodiasemana--;
	return $numerodiasemana;
}

//funcion que devuelve el ultimo dia de un mes y anyo dados
function ultimoDia($mes,$ano){ 
    $ultimo_dia=28; 
    while (checkdate($mes,$ultimo_dia + 1,$ano)){ 
       $ultimo_dia++; 
    } 
    return $ultimo_dia; 
} 

function dame_nombre_mes($mes){
	 switch ($mes){
	 	case 1:
			$nombre_mes="Enero";
			break;
	 	case 2:
			$nombre_mes="Febrero";
			break;
	 	case 3:
			$nombre_mes="Marzo";
			break;
	 	case 4:
			$nombre_mes="Abril";
			break;
	 	case 5:
			$nombre_mes="Mayo";
			break;
	 	case 6:
			$nombre_mes="Junio";
			break;
	 	case 7:
			$nombre_mes="Julio";
			break;
	 	case 8:
			$nombre_mes="Agosto";
			break;
	 	case 9:
			$nombre_mes="Septiembre";
			break;
	 	case 10:
			$nombre_mes="Octubre";
			break;
	 	case 11:
			$nombre_mes="Noviembre";
			break;
	 	case 12:
			$nombre_mes="Diciembre";
			break;
	}
	return $nombre_mes;
}

function dame_estilo($dia_imprimir){
	global $mes,$ano,$dia_solo_hoy,$tiempo_actual;
	//dependiendo si el dia es Hoy, Domigo o Cualquier otro, devuelvo un estilo
	if ($dia_solo_hoy == $dia_imprimir && $mes==date("n", $tiempo_actual) && $ano==date("Y", $tiempo_actual)){
		//si es hoy
		$estilo = " class='hoy'";
	}else{
		$fecha=mktime(12,0,0,$mes,$dia_imprimir,$ano);
		if (date("w",$fecha)==0){
			//si es domingo 
			$estilo = " class='domingo'";
		}else{
			//si es cualquier dia
			$estilo = " class='diario'";
		}
	}
	return $estilo;
}

function mostrar_calendario($mes,$ano){
	global $parametros_formulario;
	//tomo el nombre del mes que hay que imprimir
	$nombre_mes = dame_nombre_mes($mes);
	
	//construyo la tabla general
	echo '<table class="tablacalendario" cellspacing="3" cellpadding="2" border="0">';
	echo '<tr><td colspan="7" class="tit">';
	//tabla para mostrar el mes el anyo y los controles para pasar al mes anterior y siguiente
	echo '<table width="100%" cellspacing="2" cellpadding="2" border="0"><tr><td class="messiguiente">';
	//calculo el mes y ano del mes anterior
	$mes_anterior = $mes - 1;
	$ano_anterior = $ano;
	if ($mes_anterior==0){
		$ano_anterior--;
		$mes_anterior=12;
	}
	echo "<a href='index.php?$parametros_formulario&nuevo_mes=$mes_anterior&nuevo_ano=$ano_anterior'><span>&lt;&lt;</span></a></td>";
	echo "<td class='titmesano'>$nombre_mes $ano</td>";
	echo "<td class='mesanterior'>";
	//calculo el mes y ano del mes siguiente
	$mes_siguiente = $mes + 1;
	$ano_siguiente = $ano;
	if ($mes_siguiente==13){
		$ano_siguiente++;
		$mes_siguiente=1;
	}
	echo "<a href='index.php?$parametros_formulario&nuevo_mes=$mes_siguiente&nuevo_ano=$ano_siguiente'><span>&gt;&gt;</span></a></td></tr></table></td></tr>";
	echo '	<tr>
			    <td width="14%" class="diasemana">L</td>
			    <td width="14%" class="diasemana">M</td>
			    <td width="14%" class="diasemana">X</td>
			    <td width="14%" class="diasemana">J</td>
			    <td width="14%" class="diasemana">V</td>
			    <td width="14%" class="diasemana">S</td>
			    <td width="14%" class="diasemana">D</td>
			</tr>';
	
	//Variable para llevar la cuenta del dia actual
	$dia_actual = 1;
	
	//calculo el numero del dia de la semana del primer dia
	$numero_dia = calcula_numero_dia_semana(1,$mes,$ano);
	//echo "Numero del dia de demana del primer: $numero_dia <br>";
	
	//calculo el ultimo dia del mes
	$ultimo_dia = ultimoDia($mes,$ano);
	
	//escribo la primera fila de la semana
	echo "<tr>";
	for ($i=0;$i<7;$i++){
		if ($i < $numero_dia){
			//si el dia de la semana i es menor que el numero del primer dia de la semana no pongo nada en la celda
			echo '<td class="diainvalido"><span></span></td>';
		} else {
			echo "<td " . dame_estilo($dia_actual) . "><span><a href='javascript:devuelveFecha($dia_actual,$mes,$ano)'>$dia_actual</a></span></td>";
			$dia_actual++;
		}
	}
	echo "</tr>";
	
	//recorro todos los demas dias hasta el final del mes
	$numero_dia = 0;
	while ($dia_actual <= $ultimo_dia){
		//si estamos a principio de la semana escribo el <TR>
		if ($numero_dia == 0)
			echo "<tr>";
		echo "<td " . dame_estilo($dia_actual) . "><span><a href='javascript:devuelveFecha($dia_actual,$mes,$ano)'>$dia_actual</a></span></td>";
		$dia_actual++;
		$numero_dia++;
		//si es el ultimo de la semana, me pongo al principio de la semana y escribo el </tr>
		if ($numero_dia == 7){
			$numero_dia = 0;
			echo "</tr>";
		}
	}
	
	//compruebo que celdas me faltan por escribir vacias de la ultima semana del mes
	if ($numero_dia != 0){
		for ($i=$numero_dia;$i<7;$i++){
			echo '<td class="diainvalido"><span></span></td>';
		}
	}
	
	echo "</tr>";
	echo "</table>";
}	

function formularioCalendario($mes,$ano){
	global $parametros_formulario;
echo '
	<br><form action="index.php?' . $parametros_formulario . '" method="POST">
	<table align="center" cellspacing="2" cellpadding="2" border="0" class=tform>
	<tr>';
echo '
    <td align="center" valign="top">
		Mes: <br>
		<select name=nuevo_mes>
		<option value="1"';
if ($mes==1)
 echo "selected";
echo'>Enero
		<option value="2" ';
if ($mes==2) 
	echo "selected";
echo'>Febrero
		<option value="3" ';
if ($mes==3) 
	echo "selected";
echo'>Marzo
		<option value="4" ';
if ($mes==4) 
	echo "selected";
echo '>Abril
		<option value="5" ';
if ($mes==5) 
		echo "selected";
echo '>Mayo
		<option value="6" ';
if ($mes==6) 
	echo "selected";
echo '>Junio
		<option value="7" ';
if ($mes==7) 
	echo "selected";
echo '>Julio
		<option value="8" ';
if ($mes==8) 
	echo "selected";
echo '>Agosto
		<option value="9" ';
if ($mes==9) 
	echo "selected";
echo '>Septiembre
		<option value="10" ';
if ($mes==10) 
	echo "selected";
echo '>Octubre
		<option value="11" ';
if ($mes==11) 
	echo "selected";
echo '>Noviembre
		<option value="12" ';
if ($mes==12) 
    echo "selected";
echo '>Diciembre
		</select>
		</td>';
echo '		
	    <td align="center" valign="top">
		A&ntilde;o: <br>
		<select name=nuevo_ano>';

//este bucle se podria hacer dependiendo del numero de anyo que se quiera mostrar
//yo voy a mostar 10 anyos atras y 10 adelante de la fecha mostrada en el calendario
for ($anoactual=$ano-10; $anoactual<=$ano+10; $anoactual++){
	echo '<option value="' . $anoactual . '" ';
	if ($ano==$anoactual) {
		echo "selected";
	}
	echo '>' . $anoactual . '</option>';
}
echo '
	</select>
		</td>';
echo '
	</tr>
	<tr>
	    <td colspan="2" align="center"><input type="Submit" value="[ IR A ESE MES ]"></td>
	</tr>
	</table><br>
	
	<br>
	
	</form>';
}
	
////////////////////////////////////////////////////////////////////////////////////////////////////////////
//Funcion que escribe en la pagina un fomrulario preparado para introducir una fecha y enlazado con el calendario para seleccionarla comodamente
////////////////////////////////////////////////////////////////////////////////////////////////////////////
function escribe_formulario_fecha_vacio($nombrecampo,$nombreformulario){
	//Esa variable $raiz sirve para cuando se llama al calendario desde otra ruta, para poder acceder a el
	global $raiz; //empieza en . termina en /
	echo '
	<INPUT name="'.$nombrecampo.'" size="10" class="inputfecha" onclick="muestraCalendario(\''. $raiz.'\',\''. $nombreformulario .'\',\''.$nombrecampo.'\')" onfocus="blur()">
	</div>
	';	
}
?>