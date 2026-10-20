use crate::models::voluntariado::CreateSolicitudVoluntariado;
use lettre::{
    Address, AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
    message::{Mailbox, header::ContentType},
    transport::smtp::authentication::Credentials,
};
use std::env;

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

        let mailer = builder
            .port(smtp_port)
            .credentials(credentials)
            .timeout(Some(std::time::Duration::from_secs(20)))
            .build();

        Ok(Self {
            mailer,
            from: Mailbox::new(Some(smtp_from_name), from_address),
            volunteer_recipient: Mailbox::new(Some("Fundación SENO".to_owned()), recipient_address),
        })
    }

    pub async fn send_password_reset(&self, recipient: &str, link: &str) -> Result<(), String> {
        self.send_account_email(
            recipient,
            "Recuperá tu contraseña | Fundación SENO",
            format!("Solicitaste restablecer la contraseña de tu usuario en la plataforma de Fundación SENO.\n\nAbrí este enlace para elegir una nueva contraseña:\n{link}\n\nEl enlace vence en 30 minutos y solo se puede usar una vez.\nSi no hiciste esta solicitud, ignorá este correo. Tu contraseña no cambió.\n\nFundación SENO"),
        ).await
    }

    pub async fn send_password_changed(&self, recipient: &str) -> Result<(), String> {
        self.send_account_email(
            recipient,
            "Tu contraseña fue actualizada | Fundación SENO",
            "La contraseña de tu usuario en la plataforma de Fundación SENO fue actualizada.\n\nLas sesiones anteriores quedaron cerradas. Iniciá sesión con tu nueva contraseña.\nSi no hiciste este cambio, contactá de inmediato al administrador de la plataforma.\n\nFundación SENO".into(),
        ).await
    }

    async fn send_account_email(
        &self,
        recipient: &str,
        subject: &str,
        body: String,
    ) -> Result<(), String> {
        let address: Address = recipient
            .trim()
            .parse()
            .map_err(|_| "El correo registrado no es válido")?;
        let message = Message::builder()
            .from(self.from.clone())
            .to(Mailbox::new(None, address))
            .subject(subject)
            .header(ContentType::TEXT_PLAIN)
            .body(body)
            .map_err(|_| "No se pudo construir el correo de la cuenta")?;
        self.mailer
            .send(message)
            .await
            .map_err(|_| "No se pudo entregar el correo de la cuenta")?;
        Ok(())
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
