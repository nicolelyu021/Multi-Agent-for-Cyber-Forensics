from neo4j import GraphDatabase

from config import settings


class Neo4jClient:
    def __init__(self):
        self._driver = None

    @property
    def driver(self):
        if self._driver is None:
            self._driver = GraphDatabase.driver(
                settings.neo4j_uri,
                auth=(settings.neo4j_user, settings.neo4j_password),
            )
        return self._driver

    def close(self):
        if self._driver:
            self._driver.close()
            self._driver = None

    def execute_read(self, query: str, params: dict | None = None):
        with self.driver.session() as session:
            result = session.run(query, params or {})
            return [record.data() for record in result]

    def execute_write(self, query: str, params: dict | None = None):
        with self.driver.session() as session:
            result = session.run(query, params or {})
            return result.consume()

    def verify_connectivity(self) -> bool:
        try:
            self.driver.verify_connectivity()
            return True
        except Exception:
            return False


neo4j_client = Neo4jClient()
