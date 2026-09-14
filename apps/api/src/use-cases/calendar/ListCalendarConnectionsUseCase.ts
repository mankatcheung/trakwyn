import type { CalendarConnection } from '#src/domain/calendarConnection/CalendarConnection.js';
import type { ICalendarConnectionRepository } from '#src/use-cases/ports/ICalendarConnectionRepository.js';
import type { IListCalendarConnectionsUseCase } from '#src/use-cases/calendar/IListCalendarConnectionsUseCase.js';

interface Deps {
  calendarConnectionRepository: ICalendarConnectionRepository;
}

export class ListCalendarConnectionsUseCase implements IListCalendarConnectionsUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(userId: string): Promise<CalendarConnection[]> {
    return this.deps.calendarConnectionRepository.findAllByUserId(userId);
  }
}
