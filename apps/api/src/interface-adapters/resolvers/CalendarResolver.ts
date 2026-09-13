import type { CalendarProvider } from '#src/domain/calendarConnection/CalendarConnection.js';
import type { IListCalendarConnectionsUseCase } from '#src/use-cases/calendar/IListCalendarConnectionsUseCase.js';
import type { IDisconnectCalendarUseCase } from '#src/use-cases/calendar/IDisconnectCalendarUseCase.js';
import type {
  CalendarConnectionDTO,
  CalendarConnectionMapper,
} from '#src/interface-adapters/mappers/CalendarConnectionMapper.js';

interface Deps {
  listCalendarConnectionsUseCase: IListCalendarConnectionsUseCase;
  disconnectCalendarUseCase: IDisconnectCalendarUseCase;
  calendarConnectionMapper: CalendarConnectionMapper;
}

export class CalendarResolver {
  constructor(private readonly deps: Deps) {}

  async listConnections(userId: string): Promise<CalendarConnectionDTO[]> {
    const connections = await this.deps.listCalendarConnectionsUseCase.execute(userId);
    return connections.map((c) => this.deps.calendarConnectionMapper.toDTO(c));
  }

  async disconnect(userId: string, provider: CalendarProvider): Promise<boolean> {
    await this.deps.disconnectCalendarUseCase.execute({ userId, provider });
    return true;
  }
}
