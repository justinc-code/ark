use anyhow::Result;
use ark_neo4j::Neo4jStore;
use clap::{Args, Parser, Subcommand};

#[derive(Parser)]
#[command(
    name = "ark",
    version,
    about = "Web chat and graph tracing for agents and users"
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Serve the React chat and interaction graph.
    Web {
        #[arg(long, default_value = "127.0.0.1:8080")]
        bind: String,
        #[command(flatten)]
        neo4j: Neo4jArgs,
    },
}

#[derive(Args, Clone)]
struct Neo4jArgs {
    #[arg(
        long = "neo4j-url",
        env = "ARK_NEO4J_URL",
        default_value = "http://127.0.0.1:7474"
    )]
    url: String,
    #[arg(long = "neo4j-user", env = "ARK_NEO4J_USER", default_value = "neo4j")]
    user: String,
    #[arg(
        long = "neo4j-password",
        env = "ARK_NEO4J_PASSWORD",
        default_value = "password"
    )]
    password: String,
}

impl Neo4jArgs {
    fn store(&self) -> Neo4jStore {
        Neo4jStore::new(&self.url, self.user.clone(), self.password.clone())
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    match Cli::parse().command {
        Command::Web { bind, neo4j } => ark_web::serve(&bind, neo4j.store()).await?,
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_web_bind_address() {
        let cli = Cli::try_parse_from(["ark", "web", "--bind", "127.0.0.1:9000"]).unwrap();
        let Command::Web { bind, .. } = cli.command;
        assert_eq!(bind, "127.0.0.1:9000");
    }
}
