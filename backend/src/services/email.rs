use std::env;
use lettre::{
    Address, AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
    message::{Mailbox, header::ContentType},
    transport::smtp::authentication::Credentials,
};
use crate::models::voluntariado::CreateSolicitudVoluntariado;

#[derive(Debug)]
pub struct EmailService {
    mailer: AsyncSmtpTransport<Tokio1Executor>,
    from: Mailbox,
    volunteer_recipient: Mailbox,
}

impl EmailService {
    pub fn from_env() -> Result<Self, String> {
        let smtp_host = required_env("SMTP_HOST")?;
        let smtp_username = required_env("SMTP_USERNAME")?;
        let smtp_password = required_env("SMTP_PASSWORD")?;

        let smtp_from_email = required_env("SMTP_FROM_EMAIL")?;
        let smtp_from_name =
            env::var("SMTP_FROM_NAME").unwrap_or_else(|_| "Fundación SENO".to_owned());

        let volunteer_recipient_email = required_env("VOLUNTEER_TO_EMAIL")?;

        let smtp_port = env::var("SMTP_PORT")
            .unwrap_or_else(|_| "465".to_owned())
            .parse::<u16>()
            .map_err(|_| "SMTP_PORT debe contener un puerto válido".to_owned())?;

        let smtp_security = env::var("SMTP_SECURITY")
            .unwrap_or_else(|_| "tls".to_owned())
            .to_ascii_lowercase();

        let from_address: Address = smtp_from_email
            .parse()
            .map_err(|error| format!("SMTP_FROM_EMAIL no es válido: {error}"))?;

        let recipient_address: Address = volunteer_recipient_email
            .parse()
            .map_err(|error| format!("VOLUNTEER_TO_EMAIL no es válido: {error}"))?;

        let credentials = Credentials::new(smtp_username, smtp_password);

        let builder = match smtp_security.as_str() {
            "tls" => AsyncSmtpTransport::<Tokio1Executor>::relay(&smtp_host)
                .map_err(|error| format!("No se pudo configurar SMTP TLS: {error}"))?,

            "starttls" => AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&smtp_host)
                .map_err(|error| format!("No se pudo configurar SMTP STARTTLS: {error}"))?,

            other => {
                return Err(format!(
                    "SMTP_SECURITY inválido: {other}. Usa tls o starttls"
                ));
            }
        };

        let mailer = builder.port(smtp_port).credentials(credentials).build();

        Ok(Self {
            mailer,
            from: Mailbox::new(Some(smtp_from_name), from_address),
            volunteer_recipient: Mailbox::new(Some("Fundación SENO".to_owned()), recipient_address),
        })
    }

    pub async fn send_volunteer_request(
        &self,
        solicitud_id: i64,
        solicitud: &CreateSolicitudVoluntariado,
    ) -> Result<(), String> {
        let applicant_address: Address = solicitud.email.parse().map_err(|error| {
            format!("El correo del voluntario no pudo convertirse en una dirección: {error}")
        })?;

        let applicant_name = format!("{} {}", solicitud.nombre, solicitud.apellido);

        let reply_to = Mailbox::new(Some(applicant_name), applicant_address);

        let body = build_volunteer_email_body(solicitud_id, solicitud);

        let email = Message::builder()
            .from(self.from.clone())
            .to(self.volunteer_recipient.clone())
            .reply_to(reply_to)
            .subject(format!("Nueva solicitud de voluntariado #{solicitud_id}"))
            .header(ContentType::TEXT_PLAIN)
            .body(body)
            .map_err(|error| format!("No se pudo construir el correo electrónico: {error}"))?;

        self.mailer
            .send(email)
            .await
            .map_err(|error| format!("El servidor SMTP rechazó el correo: {error}"))?;

        Ok(())
    }
}

fn build_volunteer_email_body(
    solicitud_id: i64,
    solicitud: &CreateSolicitudVoluntariado,
) -> String {
    format!(
        "\
Nueva solicitud de voluntariado

Número de solicitud: {solicitud_id}

DATOS DE LA PERSONA
-------------------
Nombre: {nombre}
Apellido: {apellido}
Localidad: {localidad}
Correo electrónico: {email}
Tipo de voluntariado: {tipo}

DESCRIPCIÓN
-----------
{descripcion}

CONSENTIMIENTO
-------------
Autorizó el contacto por correo electrónico: Sí

Para responder directamente a la persona, utiliza la función «Responder» del correo.
",
        nombre = solicitud.nombre,
        apellido = solicitud.apellido,
        localidad = solicitud.localidad,
        email = solicitud.email,
        tipo = solicitud.tipo.display_name(),
        descripcion = solicitud.descripcion,
    )
}

fn required_env(name: &str) -> Result<String, String> {
    env::var(name).map_err(|_| format!("Falta la variable de entorno {name}"))
}
